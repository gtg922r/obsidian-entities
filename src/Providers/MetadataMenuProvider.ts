import { ExtraButtonComponent, Plugin, Setting } from "obsidian";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { AppWithPlugins } from "src/entities.types";
import { buildEntityCreationSuggestions } from "src/entityCreation/EntityCreationSuggestions";
import type { EntityCreationDefinition } from "src/entityCreation/EntityCreationService";

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

function parseTemplateLinkpath(templateValue: unknown): string | undefined {
	if (typeof templateValue !== "string") return undefined;

	const trimmedValue = templateValue.trim();
	const startsWrapped = trimmedValue.startsWith("[[");
	const endsWrapped = trimmedValue.endsWith("]]");
	if (startsWrapped !== endsWrapped) return undefined;

	const linkpath =
		startsWrapped && endsWrapped
			? trimmedValue.slice(2, -2).trim()
			: trimmedValue;
	const pathWithoutAlias = linkpath.split("|", 1)[0]?.trim();

	return pathWithoutAlias && pathWithoutAlias.length > 0
		? pathWithoutAlias
		: undefined;
}

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

	}

	getEntityList(query: string): EntitySuggestionItem[] {
		return [];
	}

	/** Lists Metadata Menu file classes configured with resolvable new note templates. */
	getEntityCreationDefinitions(): EntityCreationDefinition[] {
		if (!this.mdmPlugin?.fieldIndex) return [];

		const definitions: EntityCreationDefinition[] = [];
		for (const [path, fileClass] of this.mdmPlugin.fieldIndex.fileClassesPath) {
			const fileCache = this.plugin.app.metadataCache.getCache(path);
			const frontmatter = fileCache?.frontmatter;
			if (!frontmatter) continue;

			const newNoteTemplate = Array.isArray(frontmatter.newNoteTemplate)
				? frontmatter.newNoteTemplate[0]
				: frontmatter.newNoteTemplate;
			const strippedTemplateName = parseTemplateLinkpath(newNoteTemplate);
			if (!strippedTemplateName) continue;

			const templateFile = this.plugin.app.metadataCache.getFirstLinkpathDest(
				strippedTemplateName,
				path
			);
			if (!templateFile) continue;

			const definition = {
				providerTypeID: this.settings.providerTypeID,
				entityName: fileClass.name,
				templatePath: templateFile.path,
				folderPath: "",
				icon:
					frontmatter.newEntityIcon ??
					fileClass.options?.icon ??
					"plus-circle",
			};
			definitions.push(definition);
		}

		return definitions;
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
			(plugin.app as AppWithPlugins).plugins?.getPlugin("templater-obsidian") !==
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
