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
import { EntityFilter } from "src/entities.types";
import { buildIconPickerSetting, buildTemplateCreationSetting } from "src/ui/providerSettingsComponents";
import { applyFiltersToQueryResults } from "./EntityFilters";
import { FrontmatterKeySuggest } from "src/ui/FrontmatterKeySuggest";
import { setValidationStatus } from "src/ui/validationStatus";

const dataviewProviderTypeID = "dataview";

export interface DataviewProviderUserSettings
	extends EntityProviderUserSettings {
	providerTypeID: string;
	query: string;
	shouldCreateEntitiesForAliases?: boolean | undefined;
	entityFilters?: EntityFilter[];
}

const defaultDataviewProviderUserSettings: DataviewProviderUserSettings = {
	providerTypeID: dataviewProviderTypeID,
	enabled: true,
	icon: "box",
	query: "",
	entityCreationTemplates: [],
	shouldCreateEntitiesForAliases: false,
	entityFilters: [],
};

export class DataviewEntityProvider extends EntityProvider<DataviewProviderUserSettings> {
	static readonly providerTypeID: string = dataviewProviderTypeID;
	protected dv: DataviewApi | undefined;

	static getDescription(settings?: DataviewProviderUserSettings): string {
		if (settings) {
			return `🧠 Dataview entity provider (${settings.query})`;
		} else {
			return `Dataview entity provider`;
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

	}

	getEntityList(query: string): EntitySuggestionItem[] {
		const dvQueryReults = this.dv?.pages(this.settings.query);
		if (!dvQueryReults) {
			return [];
		}

		const filteredQueryResults = applyFiltersToQueryResults(dvQueryReults, this.settings.entityFilters, this.plugin.app);

		const entitiesWithAliases = (filteredQueryResults as { file: { path: string; name: string; aliases: string[] } }[])?.flatMap(
			(project) => {
				const baseEntity: EntitySuggestionItem = {
					suggestionText: project.file.name,
					icon: this.settings.icon ?? "box",
				};

				const projectEntities: EntitySuggestionItem[] = [
					baseEntity,
					...project.file.aliases.map((alias: string) => ({
						suggestionText: alias,
						icon: this.settings.icon ?? "box",
						replacementText: `${project.file.name}|${alias}`,
					})),
				];

				return projectEntities;
			}
		);

		return entitiesWithAliases || [];
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
			} catch {
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
					setValidationStatus(
						queryOKIcon,
						"search-check",
						`Dataview source OK (${numberNotesFromQuery} notes)`,
						"neutral"
					);
				} else if (queryIsOK(query) === "empty") {
				setValidationStatus(
					queryOKIcon,
					"search-x",
					"Dataview source valid but empty",
					"warning"
				);
			} else if (queryIsOK(query) === "error") {
				setValidationStatus(
					queryOKIcon,
					"alert-triangle",
					"Dataview source error",
					"error"
				);
			} else if (queryIsOK(query) === "dv not found") {
				setValidationStatus(
					queryOKIcon,
					"package-x",
					"Dataview plugin not found!",
					"error"
				);
			}
		};

		updateQueryIcon(settings.query);

		settingContainer.addText((text) => {
			text.setPlaceholder("Dataview source").setValue(settings.query);
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
		buildIconPickerSetting(settingContainer, "Icon", settings, "box-select", () => onShouldSave(settings), plugin.app);

		const dvQuerySetting = new Setting(settingContainer)
			.setName("Dataview source")
			.setDesc("The dataview source query to use as a provider");
		this.buildSummarySetting(
			dvQuerySetting,
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

		buildTemplateCreationSetting(settingContainer, settings, onShouldSave, plugin.app);

		new Setting(settingContainer)
			.setName("Entity filters")
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
					window.setTimeout(attemptFetching, retryDelay);
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
