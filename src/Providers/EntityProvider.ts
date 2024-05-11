import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { entityFromTemplateSettings } from "../entities.types";
import { createNewNoteFromTemplate } from "../entititiesUtilities";
import { Plugin, SearchResult } from "obsidian";

// Base interfaces and classes for Providers
export interface EntityProviderUserSettings {
	providerType: string;
	enabled: boolean;
	icon: string;
	entityCreationTemplates?: entityFromTemplateSettings[];
}

// export type CommonProviderSettings = {
// 	icon?: string;
// 	enabled: boolean;
// }

// export interface EntityProviderOptions {
// 	plugin: Plugin;
// 	entityCreationTemplates?: entityFromTemplateSettings[];
// 	providerSettings?: ProviderConfiguration;
// 	description?: string;
// }

export abstract class EntityProvider<T extends EntityProviderUserSettings> {
	protected settings: T;
	plugin: Plugin;
	
	abstract defaultSettings(): Partial<T>;
	abstract getEntityList(query: string): EntitySuggestionItem[];

	constructor(plugin: Plugin, settings: T) {
		this.plugin = plugin;
		this.settings = { ...this.defaultSettings(), ...settings };
	}

	/**
	 * Get the description of the provider
	 * @param settings - The settings of the provider
	 * @returns The description of the provider. Should be a short string
	 */
	static getDescription<T>(settings: T): string {
		return "Entity Provider";
	}

	/**
	 * Build the summary settings for the provider. Typically is a single text input and a button or two
	 * - Icon and enabled options will already be added
	 * @param settings - The settings of the provider
	 * @param onShouldSave - Function to call when the settings should be saved
	 */
	static buildSummarySetting<T>(
		settings: T,
		onShouldSave: (newSettings: T) => void
	): void {
		throw new Error("Not Implemented");
	}

	static buildSimpleSettings<T>(
		settings: T,
		onShouldSave: (newSettings: T) => void
	): void {
		throw new Error("Not Implemented");
	}

	static buildAdvancedSettings<T>(
		settings: T,
		onShouldSave: (newSettings: T) => void
	): void {
		throw new Error("Not Implemented");
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
			action: () => {
				console.log(`New ${template.entityName}: ${query}`);
				createNewNoteFromTemplate(
					this.plugin,
					template.templatePath,
					"TODO FIX FOLDER",
					query,
					false
				);
				return `[[${query}]]`;
			},
			match: { score: -10, matches: [] } as SearchResult,
		}));
	}
}

// export abstract class EntityProvider {
// 	plugin: Plugin;
// 	description?: string;
// 	icon?: string;
// 	config?: CommonProviderConfig; // Rename to settings, and rename above to config
// 	entityCreationTemplates?: entityFromTemplateSettings[];

// 	constructor(options: EntityProviderOptions) {
// 		this.plugin = options.plugin;
// 		this.description = options.description;
// 		this.entityCreationTemplates = options.entityCreationTemplates;
// 	}

// 	abstract getEntityList(query: string): EntitySuggestionItem[];
// 	static getProviderSettingsContent(containerEl: HTMLElement, config: CommonProviderConfig, app: App): void {
// 		containerEl.createEl("h2", { text: "Entity Provider Settings" });
// 	}

// 	getTemplateCreationSuggestions(query: string): EntitySuggestionItem[] {
// 		if (!this.entityCreationTemplates) return [];
// 		// Only Templater templates are supported for now
// 		const creationTemplates = this.entityCreationTemplates.filter(
// 			(template) => template.engine === "templater"
// 		);
// 		return creationTemplates.map((template) => ({
// 			suggestionText: `New ${template.entityName}: ${query}`,
// 			icon: "plus-circle",
// 			action: () => {
// 				console.log(`New ${template.entityName}: ${query}`);
// 				createNewNoteFromTemplate(
// 					this.plugin,
// 					template.templatePath,
// 					"TODO FIX FOLDER",
// 					query,
// 					false
// 				);
// 				return `[[${query}]]`;
// 			},
// 			match: { score: -10, matches: [] } as SearchResult,
// 		}));
// 	}
// }
