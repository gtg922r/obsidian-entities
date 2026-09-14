import type { ProviderSettingsContext } from "../ui/providerSettings";
import { cloneSettings } from "../settingsData";
import { ExtraButtonComponent, Plugin, SearchResult, Setting, TFile } from "obsidian";
import { EntitySuggestionItem } from "src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { AppWithPlugins } from "src/entities.types";
import { createNewNoteFromTemplate, creationFailure, getTemplaterCreationEngine, resolveDefaultCreationDestination } from "../entityCreation";
import { setValidationStatus } from "src/ui/validationStatus";

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
	get isQueryDependent(): boolean {
		return false;
	}

	static readonly providerTypeID: string = newProviderTypeID;
	private mdmPlugin: MetadataMenuPlugin | undefined;

	static getDescription(settings?: MetadataMenuProviderUserSettings): string {
		if (settings) {
			return `🔖 Metadata Menu provider`;
		} else {
			return `Metadata Menu provider`;
		}
	}

	getDescription(): string {
		return MetadataMenuProvider.getDescription(this.settings);
	}

	static getDefaultSettings(): MetadataMenuProviderUserSettings {
		return cloneSettings(defaultNewProviderUserSettings);
	}

	getDefaultSettings(): MetadataMenuProviderUserSettings {
		return MetadataMenuProvider.getDefaultSettings();
	}

	private resolveCapabilities() {
		const appWithPlugins = this.plugin.app as AppWithPlugins;
		this.mdmPlugin = appWithPlugins.plugins?.getPlugin?.(
			"metadata-menu"
		) as MetadataMenuPlugin;

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
		this.resolveCapabilities();
		if (!this.mdmPlugin || !this.mdmPlugin.fieldIndex) return [];

		const mdmPathsAndFileClasses: [string, MDMFileClass][] = Array.from(
			this.mdmPlugin.fieldIndex.fileClassesPath
		);
		const fileClassTemplates: Map<string, { template: TFile, icon: string, fileClassName: string }> = new Map();
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
						fileClassTemplates.set(path, { template: newNoteTemplateFile, icon: newEntityIcon, fileClassName: fileClass.name });
					}
				}
			}
		});

		// TODO add support for both Template and Templater
		return Array.from(fileClassTemplates).map(([fileClassPath, { template, icon, fileClassName }]) => {
			const fileClass = this.mdmPlugin?.fieldIndex?.fileClassesName.get(fileClassName);
			if (!fileClass) {
				throw new Error(
					`File class not found: ${fileClassName}`
				);
			}
			return {
				suggestionText: `New ${fileClassName}: ${query}`,
				icon: icon,
				noteText: `Create from ${template.path}`,
				target: {
					kind: "action" as const,
					id: JSON.stringify(["create", fileClassPath, template.path, query]),
					callback: context => {
						if (!context.canStartWork()) return { status: "cancelled" };
						try {
							const destination = resolveDefaultCreationDestination(this.plugin.app, context.source.path, `${query}.${template.extension || "md"}`);
							return createNewNoteFromTemplate(this.plugin.app, { engine: "templater", template, destination, name: query });
						} catch (error) {
							return creationFailure(error);
						}
					},
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
		const mdmPlugin = (plugin.app as AppWithPlugins).plugins?.getPlugin?.("metadata-menu") as MetadataMenuPlugin | undefined;
		const mdmPluginOK = mdmPlugin?.fieldIndex?.fileClassesName instanceof Map && mdmPlugin.fieldIndex.fileClassesPath instanceof Map;
		const templaterPluginOK = getTemplaterCreationEngine(plugin.app) !== undefined;
		const updatePluginConfiguredOKIcon = () => {
			if (
				mdmPluginOK &&
				templaterPluginOK &&
				pluginConfiguredOKIcon
			) {
				setValidationStatus(
					pluginConfiguredOKIcon,
					"package-check",
					"Note creation integrations available",
					"neutral"
				);
			} else if (pluginConfiguredOKIcon) {
				if (!mdmPluginOK) {
					setValidationStatus(
						pluginConfiguredOKIcon,
						"alert-triangle",
						"Metadata Menu file classes unavailable",
						"error"
					);
				} else if (!templaterPluginOK) {
					setValidationStatus(
						pluginConfiguredOKIcon,
						"alert-triangle",
						"Templater note creation unavailable",
						"error"
					);
				}
			}
		};

		settingContainer.addExtraButton((button) => {
			pluginConfiguredOKIcon = button;
			updatePluginConfiguredOKIcon();
			button.setDisabled(true);
		});
		// Implement logic to build summary settings UI
	}

	static getSettingDefinitions(context: ProviderSettingsContext<MetadataMenuProviderUserSettings>) {
		return [context.row("Note creation availability", "Metadata Menu file classes and Templater note creation.", setting => {
			this.buildSummarySetting(setting, context.settings(), () => {}, context.plugin);
		})];
	}

}
