import { Notice, Plugin, Setting } from "obsidian";
import { Moment } from "moment";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { AppWithPlugins } from "src/entities.types";

const dateProviderTypeID = "nlDates";

interface NLDResult {
	formattedString: string;
	date: Date;
	moment: Moment;
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

	static getDescription(settings: DatesProviderUserSettings): string {
		return `📅 NLDates Entity Provider`;
	}

	getDescription(): string {
		return DateEntityProvider.getDescription(this.settings);
	}
	getDefaultSettings(): DatesProviderUserSettings {
		return defaultDatesProviderUserSettings;
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
		return dates;
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
					new Notice(
						"NLDates Plugin Conflicts with Autocomplete. " +
							"Disable autocomplete in NLDates settings, or change its trigger phrase."
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
}
