import {
	ExtraButtonComponent,
	Plugin,
	sanitizeHTMLToDom,
	Setting,
	TFile,
} from "obsidian";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { EntityFilter } from "src/entities.types";
import { applyFiltersToFiles } from "./EntityFilters";
import { FrontmatterKeySuggest } from "src/ui/FrontmatterKeySuggest";
import { buildIconPickerSetting, buildTemplateCreationSetting, buildFolderPathSummarySetting } from "src/ui/providerSettingsComponents";
import { setValidationStatus } from "src/ui/validationStatus";

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
	shouldLoadSubFolders: false, // Not yet implemented
	shouldCreateEntitiesForAliases: true,
	propertyToCreateEntitiesFor: undefined, // Not yet implemented
	propertyToFilterEntitiesBy: undefined, // Not yet implemented
	entityCreationTemplates: [],
	entityFilters: [],
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
			return `📂 Folder entity provider (${settings.path})`;
		} else {
			return `Folder entity provider`;
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

		if (!entities) {
			return [];
		}

		const filteredEntities = applyFiltersToFiles(entities, this.settings.entityFilters, this.plugin.app);

		const entitySuggestions =
			filteredEntities?.map((file) => ({
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

		const aliasEntitiesSuggestions = filteredEntities?.flatMap((file) => {
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
		buildFolderPathSummarySetting(settingContainer, settings, onShouldSave, plugin, { showNoteCount: true });
	}

	static buildSimpleSettings(
		settingContainer: HTMLElement,
		settings: FolderProviderUserSettings,
		onShouldSave: (newSettings: FolderProviderUserSettings) => void,
		plugin: Plugin
	): void {
		buildIconPickerSetting(settingContainer, "Icon", settings, "box-select", () => onShouldSave(settings), plugin.app);

		const folderPathSetting = new Setting(settingContainer)
			.setName("Folder path")
			.setDesc("The path of the folder to use as a provider");
		this.buildSummarySetting(
			folderPathSetting,
			settings,
			onShouldSave,
			plugin
		);

		new Setting(settingContainer)
			.setName("Create entities for aliases")
			.setDesc(
				"Whether to also create entities for each alias specified for a note in the folder"
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
			.setName("Load entities from sub-folders")
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
		buildTemplateCreationSetting(settingContainer, settings, onShouldSave, plugin.app);

		new Setting(settingContainer)
			.setHeading()
			.setName("Entity filter")
			.setDesc(
				"Include or exclude entities based on whether property matches the following criteria."
			)
			.addButton((button) => {
				button.setButtonText("Add filter").onClick(() => {
					settings.entityFilters = settings.entityFilters || [];
					settings.entityFilters.push({
						type: "include",
						property: "",
						value: "",
					});
					onShouldSave(settings);
					rebuildFilters();
				});
			});

		const filtersContainer = settingContainer.createDiv();

		const validateRegex = (
			regex: string
		): "valid" | "invalid" | "empty" => {
			if (!regex) return "empty";
			try {
				new RegExp(regex);
				return "valid";
			} catch {
				return "invalid";
			}
		};

		const rebuildFilters = () => {
			filtersContainer.empty();
			settings.entityFilters?.forEach((filter, index) => {
				const filterSetting = new Setting(filtersContainer);

				let regexStatusIcon: ExtraButtonComponent;
				const updateRegexStatusIcon = (regex: string) => {
					const status = validateRegex(regex);
					if (status === "valid") {
						setValidationStatus(
							regexStatusIcon,
							"checkmark",
							"Valid regex",
							"neutral"
						);
					} else if (status === "invalid") {
						setValidationStatus(
							regexStatusIcon,
							"cross",
							"Invalid regex",
							"error"
						);
					} else {
						setValidationStatus(
							regexStatusIcon,
							"help",
							"Empty regex",
							"muted"
						);
					}
				};

				filterSetting.addExtraButton((button) => {
					regexStatusIcon = button;
					button.setDisabled(true);
					updateRegexStatusIcon(filter.value);
				});

				filterSetting.addDropdown((dropdown) => {
					dropdown.addOption("include", "Include if");
					dropdown.addOption("exclude", "Exclude if");
					dropdown.setValue(filter.type);
					dropdown.onChange((value) => {
						filter.type = value as "include" | "exclude";
						onShouldSave(settings);
					});
				});

				filterSetting.addText((text) => {
					text.setPlaceholder("Property name");
					text.setValue(filter.property);
					text.onChange((value) => {
						filter.property = value;
						onShouldSave(settings);
					});

					new FrontmatterKeySuggest(plugin.app, text.inputEl, {
						shouldCloseIfNoSuggestions: true,
					});
				});

				filterSetting.addText((text) => {
					text.setPlaceholder("Property value/regex");
					text.setValue(filter.value);
					text.onChange((value) => {
						filter.value = value;
						onShouldSave(settings);
						updateRegexStatusIcon(value);
					});
				});

				filterSetting.addButton((button) => {
					button.setIcon("trash");
					button.onClick(() => {
						settings.entityFilters?.splice(index, 1);
						onShouldSave(settings);
						rebuildFilters();
					});
				});
			});
		};

		rebuildFilters();
	}

	static buildAdvancedSettings(
		settingContainer: HTMLElement,
		settings: FolderProviderUserSettings,
		onShouldSave: (newSettings: FolderProviderUserSettings) => void,
		plugin: Plugin
	): void {
		new Setting(settingContainer)
			.setName("Create entities for values of note property")
			.setDesc(
				sanitizeHTMLToDom(
					"Whether to also create entities for each value listed in the specified property of a note in the folder.<br><br>For example, add entities based on 'username' of a note for a person."
				)
			)
			.addText((text) => {
				text.setPlaceholder("Property name").setValue("");
			});
		new Setting(settingContainer)
			.setName("Filter entities by matching property")
			.setDesc(
				sanitizeHTMLToDom(
					"Filter entities based on the value of the specified property of the current note.<br><br>For example, only show entities that have the same 'project' property as the current note."
				)
			)
			.addText((text) => {
				text.setPlaceholder("Property name").setValue("");
			});
	}
}
