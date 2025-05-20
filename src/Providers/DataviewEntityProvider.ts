import {
	App,
	ExtraButtonComponent,
	getAllTags,
	Plugin,
	Setting,
	TAbstractFile,
	TFile,
	TFolder,
} from "obsidian";
import { getAPI, DataviewApi } from "obsidian-dataview";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { TextInputSuggest, TextInputSuggestOptions } from "src/ui/suggest";
import { IconPickerModal, openTemplateDetailsModal } from "src/userComponents";
import { EntityFilter, entityFromTemplateSettings } from "src/entities.types";
import { FrontmatterKeySuggest } from "src/ui/FrontmatterKeySuggest";

const dataviewProviderTypeID = "dataview";

export interface DataviewProviderUserSettings
        extends EntityProviderUserSettings {
        providerTypeID: string;
        query: string;
        propertyToCreateEntitiesFor?: string | undefined;
        shouldCreateEntitiesForAliases?: boolean | undefined;
        entityFilters?: EntityFilter[];
}

const defaultDataviewProviderUserSettings: DataviewProviderUserSettings = {
        providerTypeID: dataviewProviderTypeID,
        enabled: true,
        icon: "box",
        query: "",
        propertyToCreateEntitiesFor: undefined,
        entityCreationTemplates: [],
        shouldCreateEntitiesForAliases: false,
        entityFilters: [],
};

export class DataviewEntityProvider extends EntityProvider<DataviewProviderUserSettings> {
	static readonly providerTypeID: string = dataviewProviderTypeID;
	protected dv: DataviewApi | undefined;

	static getDescription(settings?: DataviewProviderUserSettings): string {
		if (settings) {
			return `🧠 Dataview Entity Provider (${settings.query})`;
		} else {
			return `Dataview Entity Provider`;
		}
	}

	getDescription(): string {
		return DataviewEntityProvider.getDescription(this.settings);
	}
	static getDefaultSettings(): DataviewProviderUserSettings {
		return { ...defaultDataviewProviderUserSettings };
	}

	getDefaultSettings(): DataviewProviderUserSettings {
		return DataviewEntityProvider.getDefaultSettings();
	}

	constructor(
		plugin: Plugin,
		settings: Partial<DataviewProviderUserSettings>
	) {
		super(plugin, settings);
		this.initialize();
	}

	async initialize() {
		this.dv = await DataviewEntityProvider.getDataviewApiWithRetry(
			500,
			2,
			this.plugin.app
		);
		if (!this.dv) {
			console.log("❌ Dataview API Not Found");
		}
	}

	getEntityList(query: string): EntitySuggestionItem[] {
		const dvQueryReults = this.dv?.pages(this.settings.query);
		if (!dvQueryReults) {
			return [];
		}

		const filteredQueryResults = this.applyFilters(dvQueryReults);

                const entitiesWithAliases = filteredQueryResults?.flatMap(
                        (page: { file: { name: string; aliases: string[] } }) => {
                                const baseEntity: EntitySuggestionItem = {
                                        suggestionText: page.file.name,
                                        icon: this.settings.icon ?? "box",
                                };

                                const aliasList: string[] = [...page.file.aliases];

                                if (this.settings.propertyToCreateEntitiesFor) {
                                        const propVal = (page as Record<string, unknown>)[
                                                this.settings.propertyToCreateEntitiesFor
                                        ];
                                        if (typeof propVal === "string") aliasList.push(propVal);
                                        else if (Array.isArray(propVal)) aliasList.push(...propVal.map((v) => String(v)));
                                        else if (propVal !== undefined) aliasList.push(String(propVal));
                                }

                                const projectEntities: EntitySuggestionItem[] = [
                                        baseEntity,
                                        ...aliasList.map((alias: string) => ({
                                                suggestionText: alias,
                                                icon: this.settings.icon ?? "box",
                                                replacementText: `${page.file.name}|${alias}`,
                                        })),
                                ];

                                return projectEntities;
                        }
                );

		return entitiesWithAliases || [];
	}

	private applyFilters(
		queryResults: { file: { path: string } }[]
	): unknown[] {
		if (
			!this.settings.entityFilters ||
			this.settings.entityFilters.length === 0
		) {
			return queryResults;
		}

		const compiledFilters = this.settings.entityFilters
			.map((filter) => {
				try {
					return { ...filter, regex: new RegExp(filter.value, "i") };
				} catch (e) {
					console.error(`Invalid regex: ${filter.value}`, e);
					return null;
				}
			})
			.filter(
				(filter): filter is EntityFilter & { regex: RegExp } =>
					filter !== null
			);

		return queryResults.filter((entity) => {
			const file = this.plugin.app.vault.getAbstractFileByPath(
				entity.file.path
			) as TFile;
			const metadata = this.plugin.app.metadataCache.getFileCache(file);
			return compiledFilters.every((filter) => {
				const propertyValue = metadata?.frontmatter?.[filter.property];
				if (!propertyValue) return filter.type === "exclude";

				const matches = filter.regex.test(propertyValue);
				return filter.type === "include" ? matches : !matches;
			});
		});
	}

	static buildSummarySetting(
		settingContainer: Setting,
		settings: DataviewProviderUserSettings,
		onShouldSave: (newSettings: DataviewProviderUserSettings) => void,
		plugin: Plugin
	): void {
		const queryIsOK = (
			query: string
		): "ok" | "error" | "empty" | "dv not found" => {
			const dv: DataviewApi | undefined = getAPI(plugin.app);
			if (!dv) {
				return "dv not found";
			}
			let pages;
			try {
				pages = dv.pages(query);
			} catch (error) {
				return "error";
			}
			return pages.length > 0 ? "ok" : "empty";
		};

		let queryOKIcon: ExtraButtonComponent;
		settingContainer.addExtraButton((button) => {
			queryOKIcon = button;
			button.setDisabled(true);
		});

		const updateQueryIcon = async (query: string) => {
			if (queryIsOK(query) === "ok") {
				const dv = await DataviewEntityProvider.getDataviewApiWithRetry(
					500,
					2,
					plugin.app
				);
				const numberNotesFromQuery = dv?.pages(query).length;
				queryOKIcon.setIcon("search-check");
				queryOKIcon.setTooltip(
					`Dataview Source OK (${numberNotesFromQuery} notes)`
				);
				queryOKIcon.extraSettingsEl.style.color = "";
			} else if (queryIsOK(query) === "empty") {
				queryOKIcon.setIcon("search-x");
				queryOKIcon.setTooltip("Dataview Source Valid but Empty");
				queryOKIcon.extraSettingsEl.style.color = "var(--text-warning)";
			} else if (queryIsOK(query) === "error") {
				queryOKIcon.setIcon("alert-triangle");
				queryOKIcon.setTooltip("Dataview Source Error");
				queryOKIcon.extraSettingsEl.style.color = "var(--text-error)";
			} else if (queryIsOK(query) === "dv not found") {
				queryOKIcon.setIcon("package-x");
				queryOKIcon.setTooltip("Dataview Plugin Not Found!");
				queryOKIcon.extraSettingsEl.style.color = "var(--text-error)";
			}
		};

		updateQueryIcon(settings.query);

		settingContainer.addText((text) => {
			text.setPlaceholder("Dataview Source").setValue(settings.query);
			text.onChange((value) => {
				updateQueryIcon(value);
				if (["ok", "empty"].includes(queryIsOK(value))) {
					settings.query = value;
					onShouldSave(settings);
				}
			});

			new DataviewSourceSuggest(plugin.app, text.inputEl, {
				shouldCloseIfNoSuggestions: true,
			});
		});
	}

	static buildSimpleSettings(
		settingContainer: HTMLElement,
		settings: DataviewProviderUserSettings,
		onShouldSave: (newSettings: DataviewProviderUserSettings) => void,
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

		const dvQuerySetting = new Setting(settingContainer)
			.setName("Dataview Source")
			.setDesc("The dataview source query to use as a provider");
		this.buildSummarySetting(
			dvQuerySetting,
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
                        .setName("Property Aliases")
                        .setDesc(
                                "Frontmatter property whose values should be added as aliases"
                        )
                        .addText((text) => {
                                text.setPlaceholder("Property Name")
                                        .setValue(settings.propertyToCreateEntitiesFor ?? "");
                                text.onChange((value) => {
                                        settings.propertyToCreateEntitiesFor = value.trim() || undefined;
                                        onShouldSave(settings);
                                });

                                new FrontmatterKeySuggest(plugin.app, text.inputEl, {
                                        shouldCloseIfNoSuggestions: true,
                                });
                        });

		const entityTemplateStatusFromSetting = (
			entityCreationTemplates: entityFromTemplateSettings[]
		) => {
			if (entityCreationTemplates.length === 0) {
				return "Set Template";
			} else if (
				entityCreationTemplates.length === 1 &&
				entityCreationTemplates[0].engine !== "disabled"
			) {
				return "1 template";
			} else if (
				entityCreationTemplates.length === 1 &&
				entityCreationTemplates[0].engine === "disabled"
			) {
				return "Set Template";
			} else {
				return `${entityCreationTemplates.length} templates`;
			}
		};
		const newEntityFromTemplatesSetting = new Setting(settingContainer)
			.setName("New Entity From Templates")
			.setDesc(
				"Create entity which uses the template for a new file with the query as the file name."
			);
		newEntityFromTemplatesSetting.addButton((button) =>
			button
				.setButtonText(
					entityTemplateStatusFromSetting(
						settings.entityCreationTemplates ?? []
					)
				)
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
						button.setButtonText(
							entityTemplateStatusFromSetting([templateDetails])
						);
						onShouldSave(settings);
					}
				})
		);

		new Setting(settingContainer)
			.setName("Entity Filters")
			.setDesc(
				"Include or exclude entities based on whether property matches the following criteria."
			)
			.addButton((button) => {
				button.setButtonText("Add Filter").onClick(() => {
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
						regexStatusIcon.setIcon("checkmark");
						regexStatusIcon.setTooltip("Valid regex");
						regexStatusIcon.extraSettingsEl.style.color = "";
					} else if (status === "invalid") {
						regexStatusIcon.setIcon("cross");
						regexStatusIcon.setTooltip("Invalid regex");
						regexStatusIcon.extraSettingsEl.style.color =
							"var(--text-error)";
					} else {
						regexStatusIcon.setIcon("help");
						regexStatusIcon.setTooltip("Empty regex");
						regexStatusIcon.extraSettingsEl.style.color =
							"var(--text-muted)";
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

					new FrontmatterKeySuggest(plugin.app, text.inputEl, {
						shouldCloseIfNoSuggestions: true,
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

	// static buildAdvancedSettings(
	// 	settingContainer: HTMLElement,
	// 	settings: DataviewProviderUserSettings,
	// 	onShouldSave: (newSettings: DataviewProviderUserSettings) => void,
	// 	plugin: Plugin
	// ): void {
	// // TO IMPLEMENT AS NEEDEd
	// }

	static getDataviewApiWithRetry = (
		retryDelay: number,
		maxAttempts: number,
		app: App
	): Promise<DataviewApi | undefined> => {
		return new Promise((resolve) => {
			let attempts = 0;

			const attemptFetching = () => {
				attempts++;
				const dv: DataviewApi | undefined = getAPI(app);
				if (dv || attempts >= maxAttempts) {
					resolve(dv);
				} else {
					console.log(
						`Dataview API not found, retrying in ${retryDelay}ms...`
					);
					setTimeout(attemptFetching, retryDelay);
				}
			};

			attemptFetching();
		});
	};
}

export class DataviewSourceSuggest extends TextInputSuggest<string> {
	private suggestions: Set<string> = new Set();

	constructor(app: App, inputEl: HTMLInputElement, options?: Partial<TextInputSuggestOptions>) {
		super(app, inputEl, options);
		this.initialize();
	}

	private async initialize() {
		const abstractFiles = this.app.vault.getAllLoadedFiles();

		abstractFiles.forEach((fileOrFolder: TAbstractFile) => {
			if (fileOrFolder instanceof TFolder) {
				this.suggestions.add(fileOrFolder.path);
			} else if (fileOrFolder instanceof TFile) {
				const metadata = this.app.metadataCache.getFileCache(fileOrFolder);
				if (metadata) {
					getAllTags(metadata)?.forEach((tag) => {
						this.suggestions.add(tag);
					});
				}
			}
		});
	}

	getSuggestions(inputStr: string): string[] {
		const lowerCaseInputStr = inputStr.toLowerCase();
		return Array.from(this.suggestions).filter(suggestion =>
			suggestion.toLowerCase().includes(lowerCaseInputStr)
		);
	}

	renderSuggestion(query: string, el: HTMLElement): void {
		el.setText(query);
	}

	selectSuggestion(query: string): void {
		const inputStr = this.inputEl.value;
		const tagMatch = inputStr.match(/#\S*$/);
		const folderMatch = inputStr.match(/"\S*$/);
		const searchStr = tagMatch
			? tagMatch[0]
			: folderMatch
			? folderMatch[0].slice(1)
			: inputStr;

		const replaceStr = tagMatch
			? query
			: folderMatch
			? query + '"'
			: inputStr;

		// Replace only the current search term
		this.inputEl.value = inputStr.replace(searchStr, replaceStr);
		this.inputEl.trigger("input");
		this.close();
	}
}
