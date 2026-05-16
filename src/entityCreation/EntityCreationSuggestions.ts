import type { SearchResult, Plugin } from "obsidian";
import type { EntitySuggestionItem } from "src/EntitiesSuggestor";
import {
	createEntityFromDefinition,
	type EntityCreationDefinition,
} from "./EntityCreationService";

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
				const result = await createEntityFromDefinition(
					plugin,
					definition,
					query,
					false,
					`${definition.providerTypeID}:${definition.entityName}`
				);
			await new Promise((resolve) => window.setTimeout(resolve, 20));
			return result.link ?? `[[${query}]]`;
		},
		match: { score: -10, matches: [] } as SearchResult,
	}));
}
