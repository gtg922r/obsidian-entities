import { ExtraButtonComponent, Plugin, SearchResult, Setting, TFile } from "obsidian";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { AppWithPlugins } from "src/entities.types";
import { createNewNoteFromTemplate } from "src/entititiesUtilities";

const newProviderTypeID = "metadata-menu";

interface MetadataMenuPlugin extends Plugin {
	fieldIndex?: {
		fileClassesName: Map<string, MDMFileClass>;
		fileClassesPath: Map<string, MDMFileClass>;
	};
	settings?: {
		fileClassAlias?: string;
	};
}

interface MDMFileClass {
	name: string;
	options?: {
		icon?: string;
	};
}

export interface MetadataMenuProviderUserSettings
	extends EntityProviderUserSettings {
	providerTypeID: string;
	// Add any additional settings here
}

const defaultNewProviderUserSettings: MetadataMenuProviderUserSettings = {
	providerTypeID: newProviderTypeID,
	enabled: true,
	icon: "database",
	entityCreationTemplates: [],
	// Add default values for additional settings here
};

export class MetadataMenuProvider extends EntityProvider<MetadataMenuProviderUserSettings> {
	static readonly providerTypeID: string = newProviderTypeID;
	private mdmPlugin: MetadataMenuPlugin | undefined;

	static getDescription(settings?: MetadataMenuProviderUserSettings): string {
		if (settings) {
			return `🔖 Metadata Menu Provider`;
		} else {
			return `Metadata Menu Provider`;
		}
	}

	getDescription(): string {
		return MetadataMenuProvider.getDescription(this.settings);
	}

	static getDefaultSettings(): MetadataMenuProviderUserSettings {
		return { ...defaultNewProviderUserSettings };
	}

	getDefaultSettings(): MetadataMenuProviderUserSettings {
		return MetadataMenuProvider.getDefaultSettings();
	}

	constructor(
		plugin: Plugin,
		settings: Partial<MetadataMenuProviderUserSettings>
	) {
		super(plugin, settings);
		this.initialize();
		// Initialize any additional properties or methods here
	}

	private initialize() {
		const appWithPlugins = this.plugin.app as AppWithPlugins;
		this.mdmPlugin = appWithPlugins.plugins?.getPlugin(
			"metadata-menu"
		) as MetadataMenuPlugin;
		if (!this.mdmPlugin) {
			console.log("Metadata Menu plugin not found.");
		}
	}

	getEntityList(query: string): EntitySuggestionItem[] {
		return [];
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
		if (!this.mdmPlugin || !this.mdmPlugin.fieldIndex) return [];

		const mdmPathsAndFileClasses: [string, MDMFileClass][] = Array.from(
			this.mdmPlugin.fieldIndex.fileClassesPath
		);
		const fileClassTemplates: Map<string, { template: TFile, icon: string }> = new Map();
		mdmPathsAndFileClasses.forEach(([path, fileClass]) => {			
			const fileCache = this.plugin.app.metadataCache.getCache(path);
			if (fileCache && fileCache.frontmatter) {
				// TODO: make newNoteTemplate field settable in the settings
				const newNoteTemplate = Array.isArray(fileCache.frontmatter.newNoteTemplate)
					? fileCache.frontmatter.newNoteTemplate[0]
					: fileCache.frontmatter.newNoteTemplate;
				const strippedFileName = newNoteTemplate?.replace(/^\[\[|\]\]$/g, '');

				// Extract newEntityIcon from frontmatter
				const newEntityIcon = fileCache.frontmatter.newEntityIcon || fileClass.options?.icon || "plus-circle";

				if (strippedFileName) {
					const newNoteTemplateFile = this.plugin.app.metadataCache.getFirstLinkpathDest(strippedFileName, path);
					if (newNoteTemplateFile) {
						fileClassTemplates.set(fileClass.name, { template: newNoteTemplateFile, icon: newEntityIcon });
					}
				}
			}
		});

		// TODO add support for both Template and Templater
		return Array.from(fileClassTemplates).map(([fileClassName, { template, icon }]) => {
			const fileClass = this.mdmPlugin?.fieldIndex?.fileClassesName.get(fileClassName);
			if (!fileClass) {
				throw new Error(
					`File class not found: ${fileClassName}`
				);
			}
			return {
				suggestionText: `New ${fileClassName}: ${query}`,
				icon: icon,
				action: async () => {
                                        await createNewNoteFromTemplate(
                                                this.plugin,
                                                template,
                                                this.plugin.app.vault.getRoot(),
                                                query,
                                                false
                                        );
					await new Promise((resolve) => setTimeout(resolve, 20));
					return `[[${query}]]`;
				},
				match: { score: -10, matches: [] } as SearchResult,
			};
		});
	}

	static buildSummarySetting(
		settingContainer: Setting,
		settings: MetadataMenuProviderUserSettings,
		onShouldSave: (newSettings: MetadataMenuProviderUserSettings) => void,
		plugin: Plugin
	): void {
		let pluginConfiguredOKIcon: ExtraButtonComponent;
		const mdmPluginOK =
			(plugin.app as AppWithPlugins).plugins?.getPlugin(
				"metadata-menu"
			) !== undefined;
		const templaterPluginOK =
			(plugin.app as AppWithPlugins).plugins?.getPlugin("templater") !==
			undefined;
		const updatePluginConfiguredOKIcon = () => {
			if (
				mdmPluginOK &&
				templaterPluginOK &&
				pluginConfiguredOKIcon
			) {
				pluginConfiguredOKIcon.setIcon("package-check");
				pluginConfiguredOKIcon.setTooltip("Necessary Plugins Installed");
				pluginConfiguredOKIcon.extraSettingsEl.style.color = "";
			} else if (pluginConfiguredOKIcon) {
				if (!mdmPluginOK) {
					pluginConfiguredOKIcon.setIcon("alert-triangle");
					pluginConfiguredOKIcon.setTooltip(
						"Metadata Menu plugin not found"
					);
				} else if (!templaterPluginOK) {
					pluginConfiguredOKIcon.setIcon("alert-triangle");
					pluginConfiguredOKIcon.setTooltip(
						"Templater plugin not found"
					);
				}
				pluginConfiguredOKIcon.extraSettingsEl.style.color =
					"var(--text-error)";
			}
		};

		settingContainer.addExtraButton((button) => {
			pluginConfiguredOKIcon = button;
			updatePluginConfiguredOKIcon();
			button.setDisabled(true);
		});
		// Implement logic to build summary settings UI
	}

	// static buildSimpleSettings?(
	// 	settingContainer: HTMLElement,
	// 	settings: MetadataMenuProviderUserSettings,
	// 	onShouldSave: (newSettings: MetadataMenuProviderUserSettings) => void,
	// 	plugin: Plugin
	// ): void {
	// 	// Implement logic to build simple settings UI
	// 	// TODO check for Metadata Menu plugin and Templater plugin
	// 	// TODO add support for both Template and Templater
	// }

	// static buildAdvancedSettings?(
	// 	settingContainer: HTMLElement,
	// 	settings: MetadataMenuProviderUserSettings,
	// 	onShouldSave: (newSettings: MetadataMenuProviderUserSettings) => void,
	// 	plugin: Plugin
	// ): void {
	// 	// Implement logic to build advanced settings UI
	// }
}
