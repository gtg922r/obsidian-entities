import type { SearchResult, Plugin } from "obsidian";
import type { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { createNewNoteFromTemplate } from "src/entitiesUtilities";
import type { EntityCreationDefinition } from "./EntityCreationService";

/** Builds the existing low-scored suggester actions from shared definitions. */
export function buildEntityCreationSuggestions(
	plugin: Plugin,
	definitions: EntityCreationDefinition[],
	query: string
): EntitySuggestionItem[] {
	return definitions.map((definition) => ({
		suggestionText: `New ${definition.entityName}: ${query}`,
		icon: definition.icon ?? "plus-circle",
		action: async () => {
			await createNewNoteFromTemplate(
				plugin,
				definition.templatePath,
				definition.folderPath,
				query,
				false
			);
			await new Promise((resolve) => window.setTimeout(resolve, 20));
			return `[[${query}]]`;
		},
		match: { score: -10, matches: [] } as SearchResult,
	}));
}
