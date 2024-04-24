import { Plugin } from "obsidian";
import { Moment } from "moment";
import { EntityProvider, EntitySuggestionItem } from "src/EntitiesSuggestor";
import { AppWithPlugins } from "src/entities.types";
import Entities from "src/main";

interface NLDResult {
    formattedString: string;
    date: Date;
    moment: Moment;
}

interface NLPlugin extends Plugin {
    parseDate(date: string): NLDResult;
}

export class NLDatesEntityProvider extends EntityProvider {
    private nlpPlugin: NLPlugin | undefined;

    constructor(plugin: Entities) {
        super({
            plugin,
            description: "📅 NLDates Entity Provider"
        });
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
                icon: "calendar",
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
