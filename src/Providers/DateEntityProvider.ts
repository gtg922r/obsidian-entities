import { cloneSettings } from "../settingsData";
import {
	Plugin,
	Setting,
	moment,
} from "obsidian";
import { ActionContext, ActionResult, EntitySuggestionItem } from "src/suggestion.types";
import { createOrReusePeriodicNote } from "../entityCreation";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import {
	AppWithPlugins,
	PeriodicNotesGranularity,
} from "src/entities.types";
import { EntitiesNotice } from "src/userComponents";
import { RefreshBehavior } from "./EntityProvider";
import { IconPickerModal } from "src/userComponents";
import { setValidationStatus } from "src/ui/validationStatus";
import { captureDateRoute, dateLinkpath, DateRoute, DateRouteSnapshot, getDateRouteStatus, lookupDateFile } from "../dateNotes";
import { classifyExplicitWeek } from "./explicitWeek";

const dateProviderTypeID = "nlDates";

interface NLDResult {
	formattedString: string;
	date: Date;
	moment: moment.Moment;
}

interface NLPlugin extends Plugin {
	parseDate(date: string): NLDResult;
	settings: {
		autocompleteTriggerPhrase: string;
		isAutosuggestEnabled: boolean;
	};
}

interface DateSuggestionCandidate {
	suggestionText: string;
	noteText: string;
	linkpath: string;
	alias?: string;
	icon: string;
	granularity: PeriodicNotesGranularity;
	date: moment.Moment;
}

export interface DatesProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: string;
	shouldCreateIfNotExists: boolean;
	includeWeekSuggestions: boolean;
}

const defaultDatesProviderUserSettings: DatesProviderUserSettings = {
	providerTypeID: dateProviderTypeID,
	enabled: true,
	icon: "calendar",
	shouldCreateIfNotExists: true,
	includeWeekSuggestions: true,
	entityCreationTemplates: [],
};

/** Synchronous date interpretation and current calendar or Core daily targets. */
export class DateEntityProvider extends EntityProvider<DatesProviderUserSettings> {
	static readonly providerTypeID: string = dateProviderTypeID;

	static getDescription(settings?: DatesProviderUserSettings): string {
		if (settings) {
			return `📅 Dates entity provider`;
		} else {
			return `Dates provider`;
		}
	}

	getDescription(): string {
		return DateEntityProvider.getDescription(this.settings);
	}
	static getDefaultSettings(): DatesProviderUserSettings {
		return cloneSettings(defaultDatesProviderUserSettings);
	}

	getDefaultSettings(): DatesProviderUserSettings {
		return DateEntityProvider.getDefaultSettings();
	}

	getEntityList(query: string): EntitySuggestionItem[] {
		let nlp: NLPlugin | undefined;
		try {
			nlp = (this.plugin.app as AppWithPlugins).plugins?.getPlugin?.("nldates-obsidian") as NLPlugin | undefined;
			if (typeof nlp?.parseDate !== "function") return [];
		} catch { return []; }

		// Route reads belong to this evaluation, never a provider-wide cache or a preset row.
		const routes = new Map<PeriodicNotesGranularity, DateRoute>();
		const getRoute = (granularity: PeriodicNotesGranularity): DateRoute => {
			let route = routes.get(granularity);
			if (!route) {
				route = captureDateRoute(this.plugin.app, granularity);
				routes.set(granularity, route);
			}
			return route;
		};
		const dates: EntitySuggestionItem[] = [];
		const add = (candidate: DateSuggestionCandidate) => {
			const suggestion = this.buildDateSuggestion(candidate, getRoute(candidate.granularity));
			if (suggestion) dates.push(suggestion);
		};
		const parse = nlp.parseDate;
		const addNaturalDate = (phrase: string, icon: string) => {
			try {
				const result = parse.call(nlp, phrase);
				if (!result?.date || !moment.isMoment(result.moment) || !result.moment.isValid() ||
					typeof result.formattedString !== "string" || !result.formattedString) return;
				add({ suggestionText: phrase, noteText: result.formattedString, linkpath: result.formattedString,
					icon, granularity: "day", date: result.moment.clone() });
			} catch { /* An invalid NLP result does not suppress other dates. */ }
		};
		for (const phrase of ["today", "tomorrow", "yesterday"]) addNaturalDate(phrase, "calendar");
		for (const prefix of ["next", "last", "this"]) {
			for (const day of ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]) {
				addNaturalDate(`${prefix} ${day}`, "calendar");
			}
		}

		const now = moment();
		const explicit = classifyExplicitWeek(query, now);
		if (this.settings.includeWeekSuggestions) {
			for (const [phrase, offset] of [["this week", 0], ["last week", -1], ["next week", 1]] as const) {
				// Semantic weeks retain the selected day for the configured locale-week format.
				const date = now.clone().add(offset, "week");
				const linkpath = date.format("GGGG-[W]WW");
				add({ suggestionText: phrase, noteText: linkpath, linkpath, icon: "calendar-range", granularity: "week", date });
			}
			if (explicit.kind === "valid") {
				const date = explicit.date;
				const linkpath = date.format("GGGG-[W]WW");
				const noteText = `${linkpath} (Wk of ${date.format("M/D")})`;
				add({ suggestionText: query, noteText, linkpath, alias: noteText, icon: "calendar-range", granularity: "week", date });
			}
		}
		if (explicit.kind === "ordinary") addNaturalDate(query, this.settings.icon);
		return dates;
	}

	private buildDateSuggestion(candidate: DateSuggestionCandidate, route: DateRoute): EntitySuggestionItem | undefined {
		if (route.kind === "unavailable") return undefined;
		const suggestion: EntitySuggestionItem = {
			suggestionText: candidate.suggestionText, noteText: candidate.noteText, icon: candidate.icon,
			target: { kind: "unresolved-link", linkpath: candidate.linkpath, alias: candidate.alias },
		};
		if (route.kind === "none") return suggestion;
		try {
			const snapshot = route.snapshot;
			const formattedTitle = candidate.date.format(snapshot.format);
			const title = snapshot.engine === "core-daily" ? formattedTitle.trim() : formattedTitle;
			const linkpath = dateLinkpath(snapshot, candidate.date);
			suggestion.noteText = candidate.alias ? `${title} (Wk of ${candidate.date.format("M/D")})` : title;
			const existing = lookupDateFile(this.plugin.app, snapshot, candidate.date);
			if (existing != null) {
				suggestion.target = { kind: "file", file: existing, alias: candidate.suggestionText };
			} else if (this.settings.shouldCreateIfNotExists && snapshot.create) {
				suggestion.target = {
					kind: "action",
					id: JSON.stringify(["periodic-note", candidate.granularity, candidate.date.format(), candidate.suggestionText, linkpath]),
					callback: context => this.createOrLinkPeriodicNote(candidate, snapshot, context),
				};
			} else {
				suggestion.target = { kind: "unresolved-link", linkpath, alias: candidate.suggestionText };
			}
			return suggestion;
		} catch { return undefined; }
	}

	private async createOrLinkPeriodicNote(
		candidate: DateSuggestionCandidate, expectedRoute: DateRouteSnapshot, context: ActionContext
	): Promise<ActionResult> {
		const result = await createOrReusePeriodicNote(this.plugin.app, candidate.granularity, candidate.date,
			{ expectedRoute, canStartWork: context.canStartWork });
		return result.status === "created" || result.status === "existing" ? { ...result, alias: candidate.suggestionText } : result;
	}

	static buildSummarySetting(
		settingContainer: Setting,
		settings: DatesProviderUserSettings,
		onShouldSave: (newSettings: DatesProviderUserSettings) => void,
		plugin: Plugin
	): void {
		const appWithPlugins = plugin.app as AppWithPlugins;
		const nlpPlugin = appWithPlugins.plugins?.getPlugin(
			"nldates-obsidian"
		) as NLPlugin;
		const pluginIsConfigured =
			typeof nlpPlugin?.parseDate === "function";

		const pluginConflicts =
			nlpPlugin?.settings?.autocompleteTriggerPhrase === "@" &&
			nlpPlugin?.settings?.isAutosuggestEnabled === true;
		const granularities: PeriodicNotesGranularity[] = settings.includeWeekSuggestions ? ["day", "week"] : ["day"];
		const now = moment();
		const statuses = granularities.map(granularity => ({ granularity, status: getDateRouteStatus(captureDateRoute(plugin.app, granularity), now) }));
		const unavailable = statuses.find(({ status }) => status.kind === "unavailable");
		const limited = statuses.find(({ status }) => status.kind === "ready" && status.limitation)?.status;

		settingContainer.addExtraButton((button) => {
			if (!pluginIsConfigured) {
				setValidationStatus(
					button,
					"package-x",
					"NLDates plugin not found",
					"error"
				);
				return;
			} else if (pluginConflicts) {
				setValidationStatus(
					button,
					"alert-triangle",
					"NLDates plugin conflicts with autocomplete!",
					"error"
				);
				button.onClick(() => {
					new EntitiesNotice(
						"NLDates plugin conflicts with autocomplete. " +
							"Disable autocomplete in NLDates settings, or change its trigger phrase.",
						"alert-triangle"
					);
				});
				return;
			} else if (unavailable?.status.kind === "unavailable") {
				const { status, granularity } = unavailable;
				const message = status.engine === "core-daily" ?
					`Daily Notes ${status.reason === "folder" ? "folder" : "configuration or capability"} unavailable; check Daily Notes settings` :
					status.reason === "flat-active" ? `Periodic Notes ${granularity} flat configuration is unsupported; use a compatible calendar-set configuration` :
						`Periodic Notes ${granularity} calendar unavailable; check its active configuration`;
				setValidationStatus(button, "package-x", message, "error");
			} else if (limited?.kind === "ready" && limited.limitation) {
				const { reason, granularity, title } = limited.limitation;
				const message = reason === "title-path" ?
					`Daily Notes cannot resolve missing notes for ${JSON.stringify(title)}. Use a nonblank date format without an .md suffix or characters that change the filename in Daily Notes settings.` :
					`Periodic Notes ${granularity} format cannot resolve ${title} without an existing note at its configured path. Check the format in Periodic Notes.`;
				setValidationStatus(button, "alert-triangle", message, "warning");
			} else {
				setValidationStatus(
					button,
					"package-check",
					"NLDates plugin OK",
					"neutral"
				);
			}
		});
	}

	static buildSimpleSettings(
		settingContainer: HTMLElement,
		settings: DatesProviderUserSettings,
		onShouldSave: (newSettings: DatesProviderUserSettings) => void,
		plugin: Plugin
	): void {
		new Setting(settingContainer)
			.setName("Icon")
			.setDesc("Icon for the date entities returned by this provider")
			.addButton((button) =>
				button
					.setIcon(settings.icon ?? "calendar")
					.setDisabled(false)
					.onClick(() => {
						const iconPickerModal = new IconPickerModal(plugin.app);
						iconPickerModal.open();
						iconPickerModal.getInput().then((iconName) => {
							settings.icon = iconName;
							onShouldSave(settings);
							button.setIcon(iconName);
						});
					})
			);

		new Setting(settingContainer)
			.setName("Create non-existent dates")
			.setDesc("Whether to create date notes that don't exist yet")
			.addToggle((toggle) => {
				toggle.setValue(settings.shouldCreateIfNotExists);
				toggle.onChange((value) => {
					settings.shouldCreateIfNotExists = value;
					onShouldSave(settings);
				});
			});

		new Setting(settingContainer)
			.setName("Include week suggestions")
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- ISO week dates use uppercase W.
			.setDesc("Whether to include week-based date suggestions (e.g., 2023-W01)")
			.addToggle((toggle) => {
				toggle.setValue(settings.includeWeekSuggestions);
				toggle.onChange((value) => {
					settings.includeWeekSuggestions = value;
					onShouldSave(settings);
				});
			});
	}

	getRefreshBehavior(): RefreshBehavior {
		return RefreshBehavior.ShouldRefresh; // Always refresh for date suggestions
	}
}
