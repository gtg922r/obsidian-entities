import { Plugin } from "obsidian";
import { Moment } from 'moment';
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

function dateStringsToDateResults(plugin: NLPlugin, dateStrings: string[]): EntitySuggestionItem[] {
	return dateStrings.map((dateString) => {
		const result = plugin.parseDate(dateString);
		return {
			suggestionText: dateString,
			noteText: result.formattedString,
			replacementText: result.formattedString,
			icon: "calendar",
		};
	});
}

export function createNLDatesEntityProvider(plugin: Entities): EntityProvider | undefined {
	console.log(`Entities: 📅 NLDates Entity Provider added...`)
	return new EntityProvider(plugin, (query: string) => {

		const appWithPlugins = plugin.app as AppWithPlugins;
		const nlpPlugin = appWithPlugins.plugins?.getPlugin('nldates-obsidian') as NLPlugin;
		if (!nlpPlugin || nlpPlugin.parseDate === undefined) {
			return [];
		}

		const dates = dateStringsToDateResults(nlpPlugin, ['today', 'tomorrow', 'yesterday']);

		if (query.startsWith('next')) {
			const daysOfWeeks = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
			dates.push(...dateStringsToDateResults(nlpPlugin, daysOfWeeks.map((day) => `next ${day}`)));
		}

		if (query.startsWith('last')) {
			const daysOfWeeks = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
			dates.push(...dateStringsToDateResults(nlpPlugin, daysOfWeeks.map((day) => `last ${day}`)));
		}

		const result = nlpPlugin.parseDate(query);
		if (result && result.date) {
			dates.push({
				suggestionText: result.formattedString,
				noteText: result.date.toISOString(),
				replacementText: result.formattedString,
				icon: "calendar",
			});
		}
		return dates;
	});
}

