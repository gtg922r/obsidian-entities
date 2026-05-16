import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { entityFromTemplateSettings } from "../entities.types";
import type { Plugin } from "obsidian";
import { TriggerCharacter } from "../entities.types";
import { buildEntityCreationSuggestions } from "../entityCreation/EntityCreationSuggestions";
import type {
	EntityCreationDefinition,
} from "../entityCreation/EntityCreationService";

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

	get isEnabled(): boolean {
		return this.settings.enabled;
	}

	constructor(plugin: Plugin, settings: Partial<T>) {
		this.plugin = plugin;
		this.settings = { ...this.getDefaultSettings(), ...settings };
	}

	// New getter function for triggers
	get triggers(): TriggerCharacter[] {
		return [TriggerCharacter.At]; // Default to '@' if not overridden
	}

	/** Lists template-backed entity creation definitions supported by this provider. */
	getEntityCreationDefinitions(): EntityCreationDefinition[] {
		return (this.settings.entityCreationTemplates ?? [])
			.filter((template) => template.engine === "templater")
			.map((template) => ({
				providerTypeID: this.settings.providerTypeID,
				entityName: template.entityName,
				templatePath: template.templatePath,
				folderPath: template.folderPath ?? "",
			}));
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
		return buildEntityCreationSuggestions(
			this.plugin,
			this.getEntityCreationDefinitions(),
			query
		);
	}
}
