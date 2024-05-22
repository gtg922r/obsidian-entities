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
import { TextInputSuggest } from "src/ui/suggest";

const dataviewProviderTypeID = "dataview";

export interface DataviewProviderUserSettings
	extends EntityProviderUserSettings {
	providerTypeID: string;
	query: string;
}

const defaultDataviewProviderUserSettings: DataviewProviderUserSettings = {
	providerTypeID: dataviewProviderTypeID,
	enabled: true,
	icon: "box",
	query: "",
	entityCreationTemplates: [],
};

export class DataviewEntityProvider extends EntityProvider<DataviewProviderUserSettings> {
	static readonly providerTypeID: string = dataviewProviderTypeID;
	protected dv: DataviewApi | undefined;

	static getDescription(settings: DataviewProviderUserSettings): string {
		return `🧠 Dataview Entity Provider (${settings.query})`;
	}

	getDescription(): string {
		return DataviewEntityProvider.getDescription(this.settings);
	}
	getDefaultSettings(): DataviewProviderUserSettings {
		return defaultDataviewProviderUserSettings;
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
		const projects = this.dv?.pages(this.settings.query);

		const projectEntitiesWithAliases = projects?.flatMap(
			(project: { file: { name: string; aliases: string[] } }) => {
				const baseEntity: EntitySuggestionItem = {
					suggestionText: project.file.name,
					icon: this.settings.icon ?? "box",
				};

				const projectEntities = [
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

		return projectEntitiesWithAliases.array();
	}

	static buildSummarySetting(
		settingContainer: Setting,
		settings: DataviewProviderUserSettings,
		onShouldSave: (newSettings: DataviewProviderUserSettings) => void,
		plugin: Plugin
	): void {
		const queryIsOK = (query: string): 'ok' | 'error' | 'empty' | 'dv not found' => {
			const dv: DataviewApi | undefined = getAPI(plugin.app);
			if (!dv) {
				return 'dv not found';
			}
			let pages;
			try {
				pages = dv.pages(query);
			} catch (error) {
				return 'error';
			}
			return pages.length > 0 ? 'ok' : 'empty';
		}

		let queryOKIcon: ExtraButtonComponent;
		settingContainer.addExtraButton((button) => {
			queryOKIcon = button;
			button.setDisabled(true);			
		});

		const updateQueryIcon = (query: string) => {
			if (queryIsOK(query) === 'ok') {
				queryOKIcon.setIcon("search-check");
				queryOKIcon.setTooltip("Dataview Source OK");
				queryOKIcon.extraSettingsEl.style.color = '';
			} else if (queryIsOK(query) === 'empty') {
				queryOKIcon.setIcon("search-x");
				queryOKIcon.setTooltip("Dataview Source Valid but Empty");
				queryOKIcon.extraSettingsEl.style.color = 'var(--text-warning)';
			} else if (queryIsOK(query) === 'error') {
				queryOKIcon.setIcon("alert-triangle");
				queryOKIcon.setTooltip("Dataview Source Error");
				queryOKIcon.extraSettingsEl.style.color = 'var(--text-error)';
			} else if (queryIsOK(query) === 'dv not found') {
				queryOKIcon.setIcon("package-x");
				queryOKIcon.setTooltip("Dataview Plugin Not Found!");
				queryOKIcon.extraSettingsEl.style.color = 'var(--text-error)';
			}
		}
		
		updateQueryIcon(settings.query);

		settingContainer.addText(text => {
			text.setPlaceholder('Dataview Source').setValue(settings.query);
			text.onChange((value) => {
				updateQueryIcon(value);
				if (['ok', 'empty'].includes(queryIsOK(value))) {
					settings.query = value;
					onShouldSave(settings);
				}
			});			

			new DataviewSourceSuggest(plugin.app, text.inputEl);			
		});

	}

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
	getSuggestions(inputStr: string): string[] {
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		const folders: TFolder[] = [];
		const lowerCaseInputStr = inputStr.toLowerCase();

		const allTags: Set<string> = new Set();

		abstractFiles.forEach((fileOrFolder: TAbstractFile) => {
			if (
				fileOrFolder instanceof TFolder &&
				fileOrFolder.path.toLowerCase().contains(lowerCaseInputStr)
			) {
				folders.push(fileOrFolder);
			} else if (fileOrFolder instanceof TFile) {
				const metadata =
					this.app.metadataCache.getFileCache(fileOrFolder);
				if (metadata) {
					getAllTags(metadata)?.forEach((tag) => {
						if (tag.toLowerCase().contains(lowerCaseInputStr)) {
							allTags.add(tag);
						}
					});
				}
			}
		});

		return Array.from(allTags);
	}

	renderSuggestion(query: string, el: HTMLElement): void {
		el.setText(query);
	}

	selectSuggestion(query: string): void {
		this.inputEl.value = query;
		this.inputEl.trigger("input");
		this.close();
	}
}
