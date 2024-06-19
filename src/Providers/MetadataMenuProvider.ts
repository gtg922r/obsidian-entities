import { Plugin, SearchResult, Setting, TFile } from "obsidian";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { AppWithPlugins } from "src/entities.types";
import { createNewNoteFromTemplate } from "src/entititiesUtilities";
import { FolderSuggest } from "src/ui/file-suggest";

const newProviderTypeID = "metadata-menu";

interface MetadataMenuPlugin extends Plugin {
	fieldIndex?: {
		fileClassesName: Map<string, MDMFileClass>;
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
	fileClassPropertyName: string;
	templatePath: string;
	// Add any additional settings here
}

const defaultNewProviderUserSettings: MetadataMenuProviderUserSettings = {
	providerTypeID: newProviderTypeID,
	enabled: true,
	icon: "database",
	entityCreationTemplates: [],
	fileClassPropertyName: "fileClass",
	templatePath: "Templater",
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

		const fileClassPairs: [string, MDMFileClass][] = Array.from(
			this.mdmPlugin.fieldIndex.fileClassesName
		);

		const fileClassPropertyName =
			this.mdmPlugin.settings?.fileClassAlias || "fileClass";
		const templateFolder = this.plugin.app.vault.getFolderByPath(
			this.settings.templatePath
		);
		const templates: TFile[] | undefined = templateFolder?.children.filter(
			(file: unknown) => file instanceof TFile
		) as TFile[] | undefined;

		const fileClassTemplates: Map<string, TFile> = new Map();

		if (templates) {
			const metadataCache = this.plugin.app.metadataCache;
			templates.forEach((template) => {
				const fileCache = metadataCache.getFileCache(template);
				if (fileCache && fileCache.frontmatter) {
					const fileClass =
						fileCache.frontmatter[fileClassPropertyName];
					if (fileClass) {
						fileClassTemplates.set(fileClass, template);
					}
				}
			});
		}

		// TODO add support for both Template and Templater
		return fileClassPairs.map(([fileClassName, fileClass]) => {
			const templatePath = fileClassTemplates.get(fileClassName);
			if (!templatePath) {
				throw new Error(
					`Template not found for file class: ${fileClassName}`
				);
			}
			return {
				suggestionText: `New ${fileClassName}: ${query}`,
				icon: fileClass.options?.icon || "plus-circle",
				action: async () => {
					await createNewNoteFromTemplate(
						this.plugin,
						templatePath,
						"", // TODO THINK ABOUT FOLDER
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
		const folderExists = (folderPath: string) =>
			plugin.app.vault.getFolderByPath(folderPath) !== null;
		let pluginConfiguredOKIcon: ExtraButtonComponent;
		const mdmPluginOK =
			(plugin.app as AppWithPlugins).plugins?.getPlugin(
				"metadata-menu"
			) !== undefined;
		const templaterPluginOK =
			(plugin.app as AppWithPlugins).plugins?.getPlugin("templater") !==
			undefined;
		const updatePluginConfiguredOKIcon = (path: string) => {
			if (
				folderExists(path) &&
				mdmPluginOK &&
				templaterPluginOK &&
				pluginConfiguredOKIcon
			) {
				pluginConfiguredOKIcon.setIcon("folder-check");
				pluginConfiguredOKIcon.setTooltip("Folder Found");
				pluginConfiguredOKIcon.extraSettingsEl.style.color = "";
			} else if (pluginConfiguredOKIcon) {
				if (!folderExists(path)) {
					pluginConfiguredOKIcon.setIcon("folder-x");
					pluginConfiguredOKIcon.setTooltip(
						"Template Folder Not Found"
					);
				} else if (!mdmPluginOK) {
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
			updatePluginConfiguredOKIcon(settings.templatePath);
			button.setDisabled(true);
		});

		settingContainer.addText((text) => {
			text.setPlaceholder("Template Folder Path").setValue(settings.templatePath);
			text.onChange((value) => {
				if (folderExists(value)) {
					settings.templatePath = value;
					updatePluginConfiguredOKIcon(value);
					onShouldSave(settings);
				} else {
					updatePluginConfiguredOKIcon(value);
				}
			});

			new FolderSuggest(plugin.app, text.inputEl, {
				additionalClasses: "entities-settings",
			});
		});
		// Implement logic to build summary settings UI
	}

	static buildSimpleSettings?(
		settingContainer: HTMLElement,
		settings: MetadataMenuProviderUserSettings,
		onShouldSave: (newSettings: MetadataMenuProviderUserSettings) => void,
		plugin: Plugin
	): void {
		// Implement logic to build simple settings UI
		// TODO check for Metadata Menu plugin and Templater plugin
		// TODO add support for both Template and Templater
	}

	static buildAdvancedSettings?(
		settingContainer: HTMLElement,
		settings: MetadataMenuProviderUserSettings,
		onShouldSave: (newSettings: MetadataMenuProviderUserSettings) => void,
		plugin: Plugin
	): void {
		// Implement logic to build advanced settings UI
	}
}
