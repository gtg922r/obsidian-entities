import type { ProviderSettingsContext } from "../ui/providerSettings";
import { cloneSettings } from "../settingsData";
import { Plugin } from "obsidian";
import { EntitySuggestionItem } from "src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { EntityFilter } from "src/entities.types";
import { fileAliasSuggestions } from "./fileAliases";
import { collectFolderFiles, FileSourceResult, filterSourceFiles } from "./fileSources";
import { templateCreationSettings } from "src/ui/providerSettingsComponents";
import { fileAliasSettings, fileFilterSettings, buildFileSourceSetting } from "src/ui/fileProviderSettings";
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

	static getSettingDefinitions(context: ProviderSettingsContext<FolderProviderUserSettings>) {
		return [
			context.field("path", "Folder path", "Use files in this folder. Empty selects the vault root; spaces in paths are literal.", (setting, field) => {
				const { update, input } = buildFileSourceSetting(setting, {
					label: "Folder", placeholder: "Folder path", value: field.value,
					onChange: value => field.set(value), evaluate: () => this.evaluateSource(context.settings(), context.plugin),
					suggest: input => { new FolderSuggest(context.plugin.app, input, { additionalClasses: "entities-settings" }); },
				});
				field.captureText(input);
				context.watch(field.scope, update);
			}),
			...fileAliasSettings(context, true),
			context.field("shouldLoadSubFolders", "Load entities from sub-folders", "Include all descendants. Off includes immediate child files; attachments remain eligible.", (setting, field) => {
				setting.addToggle(toggle => toggle.setValue(field.value ?? false).onChange(value => field.set(value)));
			}),
			...templateCreationSettings(context), ...fileFilterSettings(context),
		];
	}

}
