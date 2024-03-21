import { Plugin } from "obsidian";
import { EntitiesSettingTab } from "./EntitiesSettings";
import {
	EntitiesSettings,
	DEFAULT_SETTINGS,
	ProviderConfiguration,
} from "./entities.types";
import { EntitiesSuggestor } from "./EntitiesSuggestor";
import { createFolderEntityProvider } from "./Providers/FolderEntityProvider";
import { createDataviewQueryEntityProvider } from "./Providers/DataviewEntityProvider";
import { createNLDatesEntityProvider } from "./Providers/DateEntityProvider";
import { createInsertTemplateEntityProvider, createNoteFromTemplateEntityProvider } from "./Providers/TemplateProvider";

export default class Entities extends Plugin {
	settings: EntitiesSettings;
	suggestor: EntitiesSuggestor;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EntitiesSettingTab(this.app, this));

		const nldatesProvider = createNLDatesEntityProvider(this);

		this.suggestor = new EntitiesSuggestor(
			this,
			nldatesProvider ? [nldatesProvider] : []
		);
		this.registerEditorSuggest(this.suggestor);

		this.settings.providers.forEach((providerConfig: ProviderConfiguration) => {
			switch (providerConfig.type) {
				case 'folder': {
					const folderProvider = createFolderEntityProvider(this, providerConfig.settings.path);
					if (folderProvider) {
						this.suggestor.addEntityProvider(folderProvider);
					}
					break;
				}
				case 'dataview': {
					createDataviewQueryEntityProvider(this, providerConfig.settings.query).then((provider) => {
						if (provider) {
							this.suggestor.addEntityProvider(provider);
						}
					});
					break;
				}
				case 'noteFromTemplate': {
					const provider = createNoteFromTemplateEntityProvider(this, providerConfig.settings.path);
					if (provider) {
						this.suggestor.addEntityProvider(provider);
					}
					break;
				}
				case 'insertTemplate': {
					const provider = createInsertTemplateEntityProvider(this, providerConfig.settings.path);
					if (provider) {
						this.suggestor.addEntityProvider(provider);
					}
					break;
				}
				default:
					return undefined;
			}
		});

		this.suggestor.addEntityProvider(createNoteFromTemplateEntityProvider(this, "Templater"));
		this.suggestor.addEntityProvider(createInsertTemplateEntityProvider(this, "Templater"));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
