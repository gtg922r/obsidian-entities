import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { entityFromTemplateSettings } from "../entities.types";
import { createNewNoteFromTemplate } from "../entititiesUtilities";
import { Plugin, SearchResult } from "obsidian";
import { TriggerCharacter } from "../entities.types";

// Base interfaces and classes for Providers
export interface EntityProviderID {
	providerTypeID: string;
}

export interface EntityProviderUserSettings extends EntityProviderID {
	enabled: boolean;
	icon: string;
	entityCreationTemplates?: entityFromTemplateSettings[];
}

export enum RefreshBehavior {
  ShouldRefresh = "shouldRefresh",
  Default = "default",
  Never = "never", // New refresh behavior
}

/**
 * Base class for all entity providers
 * NOTE: Extending classes must provider a unique providerTypeID in order to be registered
 */
export abstract class EntityProvider<T extends EntityProviderUserSettings> {
	protected settings: T;
	plugin: Plugin;

	abstract getDefaultSettings(): T;
	abstract getEntityList(query: string, trigger: TriggerCharacter): EntitySuggestionItem[];

	// New method to determine refresh behavior
	getRefreshBehavior(): RefreshBehavior {
		return RefreshBehavior.Default;
	}

	constructor(plugin: Plugin, settings: Partial<T>) {
		this.plugin = plugin;
		this.settings = { ...this.getDefaultSettings(), ...settings };
	}

	// New getter function for triggers
	get triggers(): TriggerCharacter[] {
		return [TriggerCharacter.At]; // Default to '@' if not overridden
	}

	/**
	 * Generates suggestions for creating new notes based on templates for a given query.
	 * Currently, only supports templates processed by the "templater" engine.
	 * For example, if the query is "Bob Hope", return a suggestion that will create a new note
	 * with the name "Bob Hope" and the content of the template.
	 *
	 * @param query - The search query to generate suggestions for.
	 * @returns An array of suggestions for entity creation.
	 */
	getTemplateCreationSuggestions(query: string): EntitySuggestionItem[] {
		if (!this.settings.entityCreationTemplates) return [];
		// Only Templater templates are supported for now
		const creationTemplates = this.settings.entityCreationTemplates.filter(
			(template) => template.engine === "templater"
		);
		return creationTemplates.map((template) => ({
			suggestionText: `New ${template.entityName}: ${query}`,
			icon: "plus-circle",
			action: async () => {
				console.log(`New ${template.entityName}: ${query}`);
                                await createNewNoteFromTemplate(
                                        this.plugin,
                                        template.templatePath,
                                        this.plugin.app.vault.getRoot(),
                                        query,
                                        false
                                );
				await new Promise(resolve => setTimeout(resolve, 20));
				return `[[${query}]]`;
			},
			match: { score: -10, matches: [] } as SearchResult,
		}));
	}
}
