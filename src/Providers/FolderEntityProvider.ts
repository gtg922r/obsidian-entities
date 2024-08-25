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
import { EntityFilter, entityFromTemplateSettings } from "src/entities.types";

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

		if (!entities) {
			return [];
		}

		const filteredEntities = this.applyFilters(entities);

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

	private applyFilters(entities: TFile[] | undefined): TFile[] | undefined {
		if (!this.settings.entityFilters || this.settings.entityFilters.length === 0) {
			return entities;
		}

		const compiledFilters = this.settings.entityFilters.map((filter) => {
			try {
				return { ...filter, regex: new RegExp(filter.value, 'i') };
			} catch (e) {
				console.error(`Invalid regex: ${filter.value}`, e);
				return null;
			}
		}).filter((filter): filter is EntityFilter & { regex: RegExp } => filter !== null);

		return entities?.filter((file) => {
			const metadata = this.plugin.app.metadataCache.getFileCache(file);
			const frontmatter = metadata?.frontmatter;
			if (!frontmatter) return false;

			return compiledFilters.every((filter) => {
				const propertyValue = frontmatter[filter.property];
				if (!propertyValue) return filter.type === "exclude";

				const matches = filter.regex.test(propertyValue);
				return filter.type === "include" ? matches : !matches;
			});
		});
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
				const folder = plugin.app.vault.getFolderByPath(path);
				const numberNotesInFolder = folder?.children.filter(
					(file) => file instanceof TFile
				).length;
				folderExistsIcon.setIcon("folder-check");
				folderExistsIcon.setTooltip(`Folder Found (${numberNotesInFolder} notes)`);
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

	static buildSimpleSettings(
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


		new Setting(settingContainer)
			.setHeading()
			.setName("Entity Filter")
			.setDesc("Include or exclude entities based on whether property matches the following criteria.")
			.addButton((button) => {
				button.setButtonText("Add Filter")
					.onClick(() => {
						settings.entityFilters = settings.entityFilters || [];
						settings.entityFilters.push({ type: "include", property: "", value: "" });
						onShouldSave(settings);
						rebuildFilters();
					});
			});

		const filtersContainer = settingContainer.createDiv();
		
		const validateRegex = (regex: string): "valid" | "invalid" | "empty" => {
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
						regexStatusIcon.setIcon("checkmark");
						regexStatusIcon.setTooltip("Valid regex");
						regexStatusIcon.extraSettingsEl.style.color = "";
					} else if (status === "invalid") {
						regexStatusIcon.setIcon("cross");
						regexStatusIcon.setTooltip("Invalid regex");
						regexStatusIcon.extraSettingsEl.style.color = "var(--text-error)";
					} else {
						regexStatusIcon.setIcon("help");
						regexStatusIcon.setTooltip("Empty regex");
						regexStatusIcon.extraSettingsEl.style.color = "var(--text-muted)";
					}
				};

				filterSetting.addExtraButton((button) => {
					regexStatusIcon = button;
					button.setDisabled(true);
					updateRegexStatusIcon(filter.value);
				});				

				filterSetting.addDropdown((dropdown) => {
					dropdown.addOption("include", "Include If");
					dropdown.addOption("exclude", "Exclude If");
					dropdown.setValue(filter.type);
					dropdown.onChange((value) => {
						filter.type = value as "include" | "exclude";
						onShouldSave(settings);
					});
				});

				filterSetting.addText((text) => {
					text.setPlaceholder("Property Name");
					text.setValue(filter.property);
					text.onChange((value) => {
						filter.property = value;
						onShouldSave(settings);
					});
				});

				filterSetting.addText((text) => {
					text.setPlaceholder("Property Value/Regex");
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
