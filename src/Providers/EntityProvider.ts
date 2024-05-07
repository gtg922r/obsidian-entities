import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import {
	CommonProviderConfig,
	entityFromTemplateSettings,
	ProviderConfiguration,
} from "../entities.types";
import { createNewNoteFromTemplate } from "../entititiesUtilities";
import {
	Plugin,
	SearchResult,
	App,
} from "obsidian";

export interface EntityProviderOptions {
	plugin: Plugin;
	entityCreationTemplates?: entityFromTemplateSettings[];
	providerSettings?: ProviderConfiguration;
	description?: string;
}

export abstract class EntityProvider {
	plugin: Plugin;
	description?: string;
	icon?: string;
	config?: CommonProviderConfig; // Rename to settings, and rename above to config
	entityCreationTemplates?: entityFromTemplateSettings[];

	constructor(options: EntityProviderOptions) {
		this.plugin = options.plugin;
		this.description = options.description;
		this.entityCreationTemplates = options.entityCreationTemplates;
	}

	abstract getEntityList(query: string): EntitySuggestionItem[];
	static getProviderSettingsContent(containerEl: HTMLElement, config: CommonProviderConfig, app: App): void {
		containerEl.createEl("h2", { text: "Entity Provider Settings" });
	}

	getTemplateCreationSuggestions(query: string): EntitySuggestionItem[] {
		if (!this.entityCreationTemplates) return [];
		// Only Templater templates are supported for now
		const creationTemplates = this.entityCreationTemplates.filter(
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
