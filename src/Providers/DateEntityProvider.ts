import {
	EditorSuggestContext,
	Plugin,
	Setting,
	TFile,
	moment,
} from "obsidian";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import {
	AppWithPlugins,
	PeriodicNotesGranularity,
	PeriodicNotesPlugin,
} from "src/entities.types";
import { EntitiesNotice } from "src/userComponents";
import { RefreshBehavior } from "./EntityProvider";
import { IconPickerModal } from "src/userComponents";
import { setValidationStatus } from "src/ui/validationStatus";

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
	replacementText: string;
	icon: string;
	granularity?: PeriodicNotesGranularity;
	date?: moment.Moment;
}

export interface DatesProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: string;
	shouldCreateIfNotExists: boolean;
	includeWeekSuggestions: boolean; // New setting
}

const defaultDatesProviderUserSettings: DatesProviderUserSettings = {
	providerTypeID: dateProviderTypeID,
	enabled: true,
	icon: "calendar",
	shouldCreateIfNotExists: true, // Not yet implemented
	includeWeekSuggestions: true, // Default to true
	entityCreationTemplates: [],
};

export class DateEntityProvider extends EntityProvider<DatesProviderUserSettings> {
	static readonly providerTypeID: string = dateProviderTypeID;
	private nlpPlugin: NLPlugin | undefined;
	private periodicNotesPlugin: PeriodicNotesPlugin | undefined;

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
		return { ...defaultDatesProviderUserSettings };
	}

	getDefaultSettings(): DatesProviderUserSettings {
		return DateEntityProvider.getDefaultSettings();
	}

	constructor(plugin: Plugin, settings: Partial<DatesProviderUserSettings>) {
		super(plugin, settings);
		this.initialize();
	}

	private initialize() {
		const appWithPlugins = this.plugin.app as AppWithPlugins;
		const nlpPlugin = appWithPlugins.plugins?.getPlugin(
			"nldates-obsidian"
		) as Partial<NLPlugin> | undefined;
		if (!nlpPlugin || typeof nlpPlugin.parseDate !== "function") {
			this.nlpPlugin = undefined;
		} else {
			this.nlpPlugin = nlpPlugin as NLPlugin;
		}

		const periodicNotesPlugin = appWithPlugins.plugins?.getPlugin(
			"periodic-notes"
		) as Partial<PeriodicNotesPlugin> | undefined;
		if (
			periodicNotesPlugin &&
			typeof periodicNotesPlugin.getPeriodicNote === "function" &&
			typeof periodicNotesPlugin.createPeriodicNote === "function"
		) {
			this.periodicNotesPlugin = periodicNotesPlugin as PeriodicNotesPlugin;
		} else {
			this.periodicNotesPlugin = undefined;
		}
	}

	getEntityList(query: string): EntitySuggestionItem[] {
		if (!this.nlpPlugin) {
			return [];
		}

		const dates = this.dateStringsToDateResults([
			"today",
			"tomorrow",
			"yesterday",
		]);

		const daysOfWeeks = [
			"sunday",
			"monday",
			"tuesday",
			"wednesday",
			"thursday",
			"friday",
			"saturday",
		];

		const prefixes = ["next", "last", "this"];
		prefixes.forEach((prefix) => {
			dates.push(
				...this.dateStringsToDateResults(
					daysOfWeeks.map((day) => `${prefix} ${day}`)
				)
			);
		});

		if (this.settings.includeWeekSuggestions) {
			const semanticWeeks = [
				{
					suggestionText: "this week",
					date: moment(),
				},
				{
					suggestionText: "last week",
					date: moment().subtract(1, "week"),
				},
				{
					suggestionText: "next week",
					date: moment().add(1, "week"),
				},
			];

			semanticWeeks.forEach(({ suggestionText, date }) => {
				const isoWeekDate = date.clone().startOf("isoWeek");
				const week = isoWeekDate.isoWeek().toString().padStart(2, "0");
				const isoDate = `${isoWeekDate.isoWeekYear()}-W${week}`;
				const replacementText =
					this.getPeriodicWeekText(date) ?? isoDate;
				dates.push(
					this.buildDateSuggestion({
						suggestionText,
						noteText: replacementText,
						replacementText,
						icon: "calendar-range",
						granularity: "week",
						date,
					})
				);
			});

			dates.push(...this.dateStringToWeekResults(query));
		}

		const result = this.nlpPlugin.parseDate(query);
		if (result && result.date) {
			dates.push(
				this.buildNlDateSuggestion(query, result, this.settings.icon)
			);
		}

		return dates;
	}

	private dateStringToWeekResults(dateString: string): EntitySuggestionItem[] {
		// Matching rules:
		// - Optional year (2 or 4 digits)
		// - Optional dash or space
		// - Week abbreviation (w, wk, week)
		// - Optional dash or space
		// - Week number (1 to 99)
		const regex = /(?:(\d{2}|\d{4})?[-\s]?(?:w|wk|week)\s?(\d{1,2}))/i;
		const match = dateString.match(regex);

		if (!match) {
			return [];
		}

		const currentMoment = moment();
		const currentYear = currentMoment.year();
		const currentWeek = currentMoment.isoWeek();

		let year = match[1]
			? match[1].length === 2
				? `20${match[1]}`
				: match[1]
			: currentYear.toString();
		const week = parseInt(match[2]);

		// If year is not specified and the week is more than 4 weeks before the current week,
		// use next year
		if (!match[1] && week < currentWeek - 4) {
			year = (currentYear + 1).toString();
		}

		const weekMoment = moment()
			.year(parseInt(year))
			.isoWeek(week)
			.startOf("isoWeek");
		const weekStartDateShort = weekMoment.format("M/D");
		const weekText = `${year}-W${week.toString().padStart(2, "0")}`;
		const replacementWeekText =
			this.getPeriodicWeekText(weekMoment) ?? weekText;

		return [
			this.buildDateSuggestion({
				suggestionText: dateString,
				noteText: `${replacementWeekText} (Wk of ${weekStartDateShort})`,
				replacementText: `${replacementWeekText}|${replacementWeekText} (Wk of ${weekStartDateShort})`,
				icon: "calendar-range",
				granularity: "week",
				date: weekMoment,
			}),
		];
	}

	private dateStringsToDateResults(
		dateStrings: string[]
	): EntitySuggestionItem[] {
		return dateStrings.map((dateString) => {
			const result = this.nlpPlugin?.parseDate(dateString);
			return this.buildNlDateSuggestion(dateString, result, "calendar");
		});
	}

	private buildNlDateSuggestion(
		suggestionText: string,
		result: NLDResult | undefined,
		icon: string
	): EntitySuggestionItem {
		const date = result?.date ? result.moment : undefined;
		return this.buildDateSuggestion({
			suggestionText,
			noteText: result?.formattedString ?? "",
			replacementText: result?.formattedString ?? "",
			icon,
			granularity: date ? "day" : undefined,
			date,
		});
	}

	private buildDateSuggestion(
		candidate: DateSuggestionCandidate
	): EntitySuggestionItem {
		const suggestion: EntitySuggestionItem = {
			suggestionText: candidate.suggestionText,
			noteText: candidate.noteText,
			replacementText: candidate.replacementText,
			icon: candidate.icon,
		};

		if (
			this.settings.shouldCreateIfNotExists &&
			this.periodicNotesPlugin &&
			candidate.granularity &&
			candidate.date &&
			this.isPeriodicGranularityEnabled(candidate.granularity)
		) {
			suggestion.action = async (item, context) =>
				this.createOrLinkPeriodicNote(candidate, item, context);
		}

		return suggestion;
	}

	private isPeriodicGranularityEnabled(
		granularity: PeriodicNotesGranularity
	): boolean {
		const calendarSetManager = this.periodicNotesPlugin?.calendarSetManager;
		if (
			!calendarSetManager ||
			typeof calendarSetManager.getActiveGranularities !== "function"
		) {
			return false;
		}

		return calendarSetManager
			.getActiveGranularities()
			.includes(granularity);
	}

	private getPeriodicWeekText(date: moment.Moment): string | undefined {
		if (
			!this.settings.shouldCreateIfNotExists ||
			!this.periodicNotesPlugin ||
			!this.isPeriodicGranularityEnabled("week")
		) {
			return undefined;
		}

		const format =
			this.periodicNotesPlugin.calendarSetManager?.getFormat?.("week");
		return format ? date.format(format) : undefined;
	}

	private async createOrLinkPeriodicNote(
		candidate: DateSuggestionCandidate,
		item: EntitySuggestionItem,
		context: EditorSuggestContext | null
	): Promise<string> {
		const fallbackText = `[[${candidate.replacementText}]]`;
		if (
			!candidate.granularity ||
			!candidate.date ||
			!this.periodicNotesPlugin
		) {
			return fallbackText;
		}

		try {
			const existingFile = this.periodicNotesPlugin.getPeriodicNote?.(
				candidate.granularity,
				candidate.date
			);
			if (existingFile) {
				return this.toMarkdownLink(existingFile, context, item.suggestionText);
			}

			const createdFile = await this.periodicNotesPlugin.createPeriodicNote?.(
				candidate.granularity,
				candidate.date
			);
			if (createdFile) {
				return this.toMarkdownLink(createdFile, context, item.suggestionText);
			}
		} catch (error) {
			console.error("Unable to create or link periodic note.", error);
			new EntitiesNotice(
				"Unable to create or link periodic note.",
				"alert-triangle"
			);
		}

		return fallbackText;
	}

	private toMarkdownLink(
		file: TFile,
		context: EditorSuggestContext | null,
		alias: string
	): string {
		return this.plugin.app.fileManager.generateMarkdownLink(
			file,
			context?.file?.path ?? "",
			undefined,
			alias
		);
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
			nlpPlugin && nlpPlugin.parseDate !== undefined;

		const pluginConflicts =
			nlpPlugin?.settings.autocompleteTriggerPhrase === "@" &&
			nlpPlugin?.settings.isAutosuggestEnabled === true;

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
