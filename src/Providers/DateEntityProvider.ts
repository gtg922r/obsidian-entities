import { Plugin, Setting, moment } from "obsidian";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { AppWithPlugins } from "src/entities.types";
import { EntitiesNotice } from "src/userComponents";
import { RefreshBehavior } from "./EntityProvider";

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

export interface DatesProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: string;
	shouldCreateIfNotExists: boolean;
}

const defaultDatesProviderUserSettings: DatesProviderUserSettings = {
	providerTypeID: dateProviderTypeID,
	enabled: true,
	icon: "calendar",
	shouldCreateIfNotExists: true, // Not yet implemented
	entityCreationTemplates: [],
};

export class DateEntityProvider extends EntityProvider<DatesProviderUserSettings> {
	static readonly providerTypeID: string = dateProviderTypeID;
	private nlpPlugin: NLPlugin | undefined;

	static getDescription(settings?: DatesProviderUserSettings): string {
		if (settings) {
			return `📅 Dates Entity Provider`;
		} else {
			return `Dates Provider`;
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
		this.nlpPlugin = appWithPlugins.plugins?.getPlugin(
			"nldates-obsidian"
		) as NLPlugin;
		if (!this.nlpPlugin || this.nlpPlugin.parseDate === undefined) {
			console.log(
				"NLDates plugin not found or parseDate method is missing."
			);
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

		const result = this.nlpPlugin.parseDate(query);
		if (result && result.date) {
			dates.push({
				suggestionText: query,
				noteText: result.formattedString,
				replacementText: result.formattedString,
				icon: this.settings.icon,
			});
		}

		dates.push(...this.dateStringToWeekResults(query));

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

		let year = match[1] ? (match[1].length === 2 ? `20${match[1]}` : match[1]) : currentYear.toString();
		const week = parseInt(match[2]);

		// If year is not specified and the week is more than 4 weeks before the current week,
		// use next year
		if (!match[1] && week < currentWeek - 4) {
			year = (currentYear + 1).toString();
		}

		const weekMoment = moment().year(parseInt(year)).isoWeek(week).startOf('isoWeek');
		const weekStartDate = weekMoment.format('YYYY-MM-DD');
		const weekStartDateShort = weekMoment.format('M/D');

		console.log(weekStartDate);
		return [{
			suggestionText: dateString,
			noteText: `${year}-W${week.toString().padStart(2, '0')} (Wk of ${weekStartDateShort})`,
			replacementText: `${year}-W${week.toString().padStart(2, '0')}|${year}-W${week.toString().padStart(2, '0')} (Wk of ${weekStartDateShort})`,
			icon: "calendar-range",
		}];
	}

	private dateStringsToDateResults(
		dateStrings: string[]
	): EntitySuggestionItem[] {
		return dateStrings.map((dateString) => {
			const result = this.nlpPlugin?.parseDate(dateString);
			return {
				suggestionText: dateString,
				noteText: result?.formattedString ?? "",
				replacementText: result?.formattedString ?? "",
				icon: "calendar",
			};
		});
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
				button.setIcon("package-x");
				button.setTooltip("NLDates Plugin Not Found");
				button.extraSettingsEl.style.color = "var(--text-error)";
				return;
			} else if (pluginConflicts) {
				button.setIcon("alert-triangle");
				button.setTooltip(
					"NLDates Plugin Conflicts with Autocomplete!"
				);
				button.extraSettingsEl.style.color = "var(--text-error)";
				button.onClick(() => {
					new EntitiesNotice(
						"NLDates Plugin Conflicts with Autocomplete. " +
							"Disable autocomplete in NLDates settings, or change its trigger phrase.",
						"alert-triangle"
					);
				});
				return;
			} else {
				button.setIcon("package-check");
				button.setTooltip("NLDates Plugin OK");
				button.extraSettingsEl.style.color = "";
			}
		});
	}

	getRefreshBehavior(): RefreshBehavior {
		return RefreshBehavior.ShouldRefresh; // Always refresh for date suggestions
	}
}
