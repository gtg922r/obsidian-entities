import {
	ExtraButtonComponent,
	Plugin,
	sanitizeHTMLToDom,
	Setting,
	TFile,
} from "obsidian";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { FolderSuggest } from "src/ui/file-suggest";
import { IconPickerModal, openTemplateDetailsModal } from "src/userComponents";
import { entityFromTemplateSettings } from "src/entities.types";

const folderProviderTypeID = "folder";

export interface FolderProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: string;
	path: string;
	shouldLoadSubFolders?: boolean | undefined;
	shouldCreateEntitiesForAliases?: boolean | undefined;
	propertyToCreateEntitiesFor?: string | undefined;
	propertyToFilterEntitiesBy?: string | undefined;
}

const defaultFolderProviderUserSettings: FolderProviderUserSettings = {
	providerTypeID: folderProviderTypeID,
	enabled: true,
	icon: "folder-open-dot",
	path: "",
	shouldLoadSubFolders: false, // Not yet implemented
	shouldCreateEntitiesForAliases: true,
	propertyToCreateEntitiesFor: undefined, // Not yet implemented
	propertyToFilterEntitiesBy: undefined, // Not yet implemented
	entityCreationTemplates: [],
};

export class FolderEntityProvider extends EntityProvider<FolderProviderUserSettings> {
	static readonly providerTypeID: string = folderProviderTypeID;

	static getDefaultSettings(): FolderProviderUserSettings {
		return { ...defaultFolderProviderUserSettings };
	}

	getDefaultSettings(): FolderProviderUserSettings {
		return FolderEntityProvider.getDefaultSettings();
	}

	static getDescription(settings?: FolderProviderUserSettings): string {
		if (settings) {
			return `📂 Folder Entity Provider (${settings.path})`;
		} else {
			return `Folder Entity Provider`;
		}
	}

	getDescription(): string {
		return FolderEntityProvider.getDescription(this.settings);
	}

	getEntityList(query: string): EntitySuggestionItem[] {
		const entityFolder = this.plugin.app.vault.getFolderByPath(
			this.settings.path
		);
		const entities: TFile[] | undefined = entityFolder?.children.filter(
			(file: unknown) => file instanceof TFile
		) as TFile[] | undefined;

		const entitySuggestions =
			entities?.map((file) => ({
				suggestionText: file.basename,
				icon: this.settings.icon ?? "folder-open-dot",
			})) ?? [];

		const suggestionFromAlias: (
			alias: string,
			file: TFile
		) => EntitySuggestionItem = (alias: string, file: TFile) => ({
			suggestionText: alias,
			icon: this.settings.icon ?? "folder-open-dot",
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

	static buildSummarySetting(
		settingContainer: Setting,
		settings: FolderProviderUserSettings,
		onShouldSave: (newSettings: FolderProviderUserSettings) => void,
		plugin: Plugin
	): void {
		const folderExists = (folderPath: string) =>
			plugin.app.vault.getFolderByPath(folderPath) !== null;
		let folderExistsIcon: ExtraButtonComponent;
		const updateFolderExistsIcon = (path: string) => {
			if (folderExists(path) && folderExistsIcon) {
				folderExistsIcon.setIcon("folder-check");
				folderExistsIcon.setTooltip("Folder Found");
				folderExistsIcon.extraSettingsEl.style.color = "";
			} else if (folderExistsIcon) {
				folderExistsIcon.setIcon("folder-x");
				folderExistsIcon.setTooltip("Folder Not Found");
				folderExistsIcon.extraSettingsEl.style.color =
					"var(--text-error)";
			}
		};
		settingContainer.addExtraButton((button) => {
			folderExistsIcon = button;
			updateFolderExistsIcon(settings.path);
			button.setDisabled(true);
		});

		settingContainer.addText((text) => {
			text.setPlaceholder("Folder Path").setValue(settings.path);
			text.onChange((value) => {
				if (folderExists(value)) {
					updateFolderExistsIcon(value);
					settings.path = value;
					onShouldSave(settings);
				} else {
					updateFolderExistsIcon(value);
				}
			});

			new FolderSuggest(plugin.app, text.inputEl, {additionalClasses:"entities-settings"});
		});
	}

	static buildSimpleSettings?(
		settingContainer: HTMLElement,
		settings: FolderProviderUserSettings,
		onShouldSave: (newSettings: FolderProviderUserSettings) => void,
		plugin: Plugin
	): void {

		new Setting(settingContainer)
			.setName("Icon")
			.setDesc("Icon for the entities returned by this provider")
			.addButton((button) =>
				button
					.setIcon(settings.icon ?? "box-select")
					.setDisabled(false)
					.onClick(() => {
						const iconPickerModal = new IconPickerModal(plugin.app);
						iconPickerModal.open();
						iconPickerModal.getInput().then((iconName) => {
							settings.icon = iconName;
							onShouldSave(settings);
							button.setIcon(iconName);
						});
					})
			);

		const folderPathSetting = new Setting(settingContainer)
			.setName("Folder Path")
			.setDesc("The path of the folder to use as a provider");
		this.buildSummarySetting(
			folderPathSetting,
			settings,
			onShouldSave,
			plugin
		);

		new Setting(settingContainer)
			.setName("Create Entities for Aliases")
			.setDesc(
				"Whether to also create Entities for each alias specified for a Note in the folder"
			)
			.addToggle((toggle) => {
				toggle.setValue(
					settings.shouldCreateEntitiesForAliases ?? false
				);
				toggle.onChange((value) => {
					settings.shouldCreateEntitiesForAliases = value;
					onShouldSave(settings);
				});
			});
		new Setting(settingContainer)
			.setName("Load Entities from Sub-Folders")
			.setDesc(
				"Whether to also load entities from sub-folders or just the top-level folder"
			)
			.addToggle((toggle) => {
				toggle.setValue(settings.shouldLoadSubFolders ?? false);
				toggle.onChange((value) => {
					settings.shouldLoadSubFolders = value;
					onShouldSave(settings);
				});
			});
		const entityTemplateStatusFromSetting = (entityCreationTemplates: entityFromTemplateSettings[]) => {
			if (entityCreationTemplates.length === 0) {
				return "Set Template";
			} else if (entityCreationTemplates.length === 1 && entityCreationTemplates[0].engine !== "disabled") {
				return "1 template";
			} else if (entityCreationTemplates.length === 1 && entityCreationTemplates[0].engine === "disabled") {
				return "Set Template";
			} else {
				return `${entityCreationTemplates.length} templates`;
			}
		}
		const newEntityFromTemplatesSetting = new Setting(settingContainer)
			.setName("New Entity From Templates")
			.setDesc(
				"Create entity which uses the template for a new file with the query as the file name."
			);
		newEntityFromTemplatesSetting.addButton((button) =>
			button
				.setButtonText(entityTemplateStatusFromSetting(settings.entityCreationTemplates ?? []))
				.onClick(async () => {
					// Open a modal or another UI component to input template details
					// For simplicity, assuming a modal is used and returns an object with template details
					const initialSettings =
						settings.entityCreationTemplates ?? [];
					const templateDetails = await openTemplateDetailsModal(
						initialSettings[0]
					);
					if (templateDetails) {
						settings.entityCreationTemplates = [templateDetails];
						button.setButtonText(entityTemplateStatusFromSetting([templateDetails]))
						onShouldSave(settings);
					}
				})
		);
	}

	static buildAdvancedSettings?(
		settingContainer: HTMLElement,
		settings: FolderProviderUserSettings,
		onShouldSave: (newSettings: FolderProviderUserSettings) => void,
		plugin: Plugin
	): void {
		new Setting(settingContainer)
			.setName("Create Entities for Values of Note Property")
			.setDesc(
				sanitizeHTMLToDom(
					"Whether to also create Entities for each value listed in the specified property of a Note in the folder.<br><br>For example, add entities based on 'username' of a note for a Person."
				)
			)
			.addText((text) => {
				text.setPlaceholder("Property Name").setValue("");
			});
		new Setting(settingContainer)
			.setName("Filter Entities by Matching Property")
			.setDesc(
				sanitizeHTMLToDom(
					"Filter entities based on the value of the specified property of the current note.<br><br>For example, only show entities that have the same 'project' property as the current note."
				)
			)
			.addText((text) => {
				text.setPlaceholder("Property Name").setValue("");
			});
	}
}
