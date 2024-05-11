import { Plugin } from "obsidian";
import { Moment } from "moment";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { AppWithPlugins } from "src/entities.types";

interface NLDResult {
    formattedString: string;
    date: Date;
    moment: Moment;
}

interface NLPlugin extends Plugin {
    parseDate(date: string): NLDResult;
}

interface DatesProviderUserSettings extends EntityProviderUserSettings {
	providerType: "nldates";
	shouldCreateIfNotExists: boolean;
}

const defaultDatesProviderUserSettings: DatesProviderUserSettings = {
	providerType: "nldates",
	enabled: true,
	icon: "calendar",
	shouldCreateIfNotExists: true, // Not yet implemented
	entityCreationTemplates: [],
};


export class DateEntityProvider extends EntityProvider<DatesProviderUserSettings> {
    private nlpPlugin: NLPlugin | undefined;

	getDescription(): string {
		return "📅 NLDates Entity Provider";
	}
	getDefaultSettings(): Partial<DatesProviderUserSettings> {
		return defaultDatesProviderUserSettings;
	}

    constructor(plugin: Plugin, settings: DatesProviderUserSettings) {
        super(plugin, settings);
        this.initialize();
    }

    private initialize() {
        const appWithPlugins = this.plugin.app as AppWithPlugins;
        this.nlpPlugin = appWithPlugins.plugins?.getPlugin("nldates-obsidian") as NLPlugin;
        if (!this.nlpPlugin || this.nlpPlugin.parseDate === undefined) {
            console.log("NLDates plugin not found or parseDate method is missing.");
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
            "sunday", "monday", "tuesday", "wednesday",
            "thursday", "friday", "saturday",
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

    private dateStringsToDateResults(dateStrings: string[]): EntitySuggestionItem[] {
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
}
