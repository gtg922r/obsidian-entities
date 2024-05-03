import { App, Plugin, sanitizeHTMLToDom, Setting, TFile } from "obsidian";
import { CommonProviderConfig, ProviderTemplateCreationSettings } from "src/entities.types";
import { EntityProvider, EntitySuggestionItem } from "src/EntitiesSuggestor";
import { FolderSuggest } from "src/ui/file-suggest";
import { IconPickerModal } from "src/userComponents";

export interface FolderProviderConfig extends ProviderTemplateCreationSettings, CommonProviderConfig {
	path: string;
	shouldLoadSubFolders?: boolean | undefined;
	shouldCreateEntitiesForAliases?: boolean | undefined;
	propertyToCreateEntitiesFor?: string | undefined;
	propertyToFilterEntitiesBy?: string | undefined;
}

const defaultFolderProviderSettings: FolderProviderConfig = {
    path: '',
    shouldLoadSubFolders: false,
    shouldCreateEntitiesForAliases: true,
    propertyToCreateEntitiesFor: undefined,
    propertyToFilterEntitiesBy: undefined,
    newEntityFromTemplates: [],
    icon: 'folder'
};

export class FolderEntityProvider extends EntityProvider {
	constructor(plugin: Plugin, private settings: FolderProviderConfig) {
		super({
			plugin,
			description: `📂 Folder Entity Provider (${settings.path})`,
			entityCreationTemplates: settings.newEntityFromTemplates,
		});
		this.config = settings;
	}
	config: FolderProviderConfig;
	getEntityList(query: string): EntitySuggestionItem[] {
		const entityFolder = this.plugin.app.vault.getFolderByPath(
			this.config.path
		);
		const entities: TFile[] | undefined = entityFolder?.children.filter(
			(file: unknown) => file instanceof TFile
		) as TFile[] | undefined;

		const entitySuggestions =
			entities?.map((file) => ({
				suggestionText: file.basename,
				icon: this.icon ?? "folder-open-dot",
			})) ?? [];

		const suggestionFromAlias: (
			alias: string,
			file: TFile
		) => EntitySuggestionItem = (alias: string, file: TFile) => ({
			suggestionText: alias,
			icon: this.icon ?? "folder-open-dot",
			replacementText: `${file.basename}|${alias}`,
		});

		const aliasEntitiesSuggestions = entities?.flatMap((file) => {
			const aliases = this.plugin.app.metadataCache.getFileCache(file)
				?.frontmatter?.aliases as string | string[] | undefined;
			if (typeof aliases === "string")
				return [suggestionFromAlias(aliases, file)];
			return aliases
				? aliases.map((alias) => suggestionFromAlias(alias, file))
				: [];
		});

		return aliasEntitiesSuggestions
			? [...entitySuggestions, ...aliasEntitiesSuggestions]
			: entitySuggestions;
	}

	static getDefaultProviderConfig(): FolderProviderConfig {
		return defaultFolderProviderSettings;
	}

	static getProviderSettingsContent(
		containerEl: HTMLElement,
		config: FolderProviderConfig,
		app: App
	): void {
		containerEl.createEl("h2", { text: "Provider Settings" });
		new Setting(containerEl)
			.setHeading()
			.setName("Folder Provider Settings")
			.setDesc("Settings for Provider which searches a specified folder and generates entities based on the files in the folder.");
			
		new Setting(containerEl)
			.setName("Enabled")
			.setDesc("Enable this provider")
			.addToggle((toggle) => {
				toggle.setValue(true);
			});
		new Setting(containerEl)
			.setName("Folder Path")
			.setDesc("The path of the folder to use as a provider")
			.addSearch((search) => {
				search
					.setPlaceholder("Folder Path")
					.setValue(config.path)
					.onChange((value) => {
						config.path = value;
					});
				new FolderSuggest(app, search.inputEl);
			});
		new Setting(containerEl)
			.setName("Icon")
			.setDesc("The icon to use for the provider")
			.addText((text) => {
				text.setPlaceholder("Icon Name")
					.setValue(config.icon || "")
					.setDisabled(true);
			})
			.addButton((button) =>
				button.setIcon(config.icon ?? "box-select").onClick(() => {
					const iconPickerModal = new IconPickerModal(app);
					iconPickerModal.open();
				})
			);
		new Setting(containerEl)
			.setName("New Entity From Templates")
			.setDesc(
				"Adds an entity which uses the specified template to make a new file. New file name is set to the query text."
			)
			.addText((text) => {
				text.setValue(
					config.newEntityFromTemplates
						?.map((template) => template.templatePath)
						.join("\n") ?? ""
				).setDisabled(true);
			})
			.addButton((button) =>
				button.setButtonText("Set").onClick(() => {
					// Handle adding a new template
				})
			);
		new Setting(containerEl)
			.setHeading()
			.setName("Advanced Settings")
			.setDesc("Settings that are more advanced and may require more care");
		
		new Setting(containerEl)
			.setName("Load Entities from Sub-Folders")
			.setDesc(
				"Whether to also load entities from sub-folders or just the top-level folder"
			)
			.addToggle((toggle) => {
				toggle.setValue(true);
			});
		new Setting(containerEl)
			.setName("Create Entities for Aliases")
			.setDesc(
				"Whether to also create Entities for each alias specified for a Note in the folder"
			)
			.addToggle((toggle) => {
				toggle.setValue(true);
			});
		new Setting(containerEl)
			.setName("Create Entities for Values of Property")
			.setDesc(
				sanitizeHTMLToDom("Whether to also create Entities for each value listed in the specified property of a Note in the folder.<br><br>For example, add entities based on 'username' of a note for a Person.")
			)
			.addText((text) => {
				text.setPlaceholder("Property Name").setValue("");
			});
		new Setting(containerEl)
			.setName("Filter Entities by Current Property")
			.setDesc(
				sanitizeHTMLToDom("Filter entities based on the value of the specified property of the current note.<br><br>For example, only show entities that have the same 'project' property as the current note.")
			)
			.addText((text) => {
				text.setPlaceholder("Property Name").setValue("");
			});
	}
}
