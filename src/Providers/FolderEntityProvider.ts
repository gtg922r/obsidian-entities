import { cloneSettings } from "../settingsData";
import { Plugin, Setting } from "obsidian";
import { EntitySuggestionItem } from "src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { EntityFilter } from "src/entities.types";
import { fileAliasSuggestions } from "./fileAliases";
import { collectFolderFiles, FileSourceResult, filterSourceFiles } from "./fileSources";
import { buildIconPickerSetting, buildTemplateCreationSetting } from "src/ui/providerSettingsComponents";
import { buildFileAliasSettings, buildFileFilterSettings, buildFileSourceSetting } from "src/ui/fileProviderSettings";
import { FolderSuggest } from "src/ui/file-suggest";

const folderProviderTypeID = "folder";

export interface FolderProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: string;
	path: string;
	shouldLoadSubFolders?: boolean | undefined;
	shouldCreateEntitiesForAliases?: boolean | undefined;
	propertyToCreateEntitiesFor?: string | undefined;
	propertyToFilterEntitiesBy?: string | undefined;
	entityFilters?: EntityFilter[];
}

const defaultFolderProviderUserSettings: FolderProviderUserSettings = {
	providerTypeID: folderProviderTypeID,
	enabled: true,
	icon: "folder-open-dot",
	path: "",
	shouldLoadSubFolders: false,
	shouldCreateEntitiesForAliases: true,
	propertyToCreateEntitiesFor: undefined,
	propertyToFilterEntitiesBy: undefined, // Not yet implemented
	entityCreationTemplates: [],
	entityFilters: [],
};

export class FolderEntityProvider extends EntityProvider<FolderProviderUserSettings> {
	get isQueryDependent(): boolean {
		return false;
	}

	static readonly providerTypeID: string = folderProviderTypeID;

	static getDefaultSettings(): FolderProviderUserSettings {
		return cloneSettings(defaultFolderProviderUserSettings);
	}

	getDefaultSettings(): FolderProviderUserSettings {
		return FolderEntityProvider.getDefaultSettings();
	}

	static getDescription(settings?: FolderProviderUserSettings): string {
		if (settings) {
			return `📂 Folder entity provider (${settings.path})`;
		} else {
			return `Folder entity provider`;
		}
	}

	getDescription(): string {
		return FolderEntityProvider.getDescription(this.settings);
	}

	private static evaluateSource(settings: FolderProviderUserSettings, plugin: Plugin): FileSourceResult {
		const folder = settings.path === "" ? plugin.app.vault.getRoot() : plugin.app.vault.getFolderByPath(settings.path);
		if (!folder) return { status: "error", message: "Folder not found — no file suggestions" };
		return filterSourceFiles(collectFolderFiles(folder, settings.shouldLoadSubFolders ?? false), settings.entityFilters, plugin.app);
	}

	getEntityList(query: string): EntitySuggestionItem[] {
		const result = FolderEntityProvider.evaluateSource(this.settings, this.plugin);
		if (result.status !== "ready") return [];
		const icon = this.settings.icon ?? "folder-open-dot";
		return [
			...result.files.map((file): EntitySuggestionItem => ({ suggestionText: file.basename, target: { kind: "file", file }, icon })),
			...result.files.flatMap(file => fileAliasSuggestions(file, this.plugin.app, this.settings, icon)),
		];
	}

	private static buildSourceSetting(
		row: Setting, settings: FolderProviderUserSettings, save: (settings: FolderProviderUserSettings) => void, plugin: Plugin
	): () => void {
		return buildFileSourceSetting(row, {
			label: "Folder", placeholder: "Folder path", value: settings.path,
			onChange: value => { settings.path = value; save(settings); },
			evaluate: () => this.evaluateSource(settings, plugin),
			suggest: input => { new FolderSuggest(plugin.app, input, { additionalClasses: "entities-settings" }); },
		});
	}

	static buildSummarySetting(
		settingContainer: Setting, settings: FolderProviderUserSettings,
		onShouldSave: (newSettings: FolderProviderUserSettings) => void, plugin: Plugin
	): void {
		this.buildSourceSetting(settingContainer, settings, onShouldSave, plugin);
	}

	static buildSimpleSettings(
		settingContainer: HTMLElement, settings: FolderProviderUserSettings,
		onShouldSave: (newSettings: FolderProviderUserSettings) => void, plugin: Plugin
	): void {
		buildIconPickerSetting(settingContainer, "Icon", settings, "box-select", () => onShouldSave(settings), plugin.app);
		const path = new Setting(settingContainer).setName("Folder path")
			.setDesc("Use files in this folder. Empty selects the vault root; spaces in paths are literal.");
		const updateSource = this.buildSourceSetting(path, settings, onShouldSave, plugin);
		buildFileAliasSettings(settingContainer, settings, true, onShouldSave, plugin.app);
		new Setting(settingContainer)
			.setName("Load entities from sub-folders")
			.setDesc("Include all descendant files. Off includes only immediate child files; attachments remain eligible.")
			.addToggle(toggle => toggle.setValue(settings.shouldLoadSubFolders ?? false).onChange(value => {
				settings.shouldLoadSubFolders = value;
				onShouldSave(settings);
				updateSource();
			}));
		buildTemplateCreationSetting(settingContainer, settings, onShouldSave, plugin.app);
		buildFileFilterSettings(settingContainer, settings, onShouldSave, plugin.app, updateSource);
	}
}
