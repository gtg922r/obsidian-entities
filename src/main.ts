import { Plugin } from "obsidian";
import { EntitiesSettingTab } from "./EntitiesSettings";
import {
	EntitiesSettings,
	DEFAULT_SETTINGS,
	ProviderConfiguration,
} from "./entities.types";
import { EntitiesSuggestor } from "./EntitiesSuggestor";
import { FolderEntityProvider } from "./Providers/FolderEntityProvider";
import { DataviewEntityProvider } from "./Providers/DataviewEntityProvider";
import { NLDatesEntityProvider } from "./Providers/DateEntityProvider";
import { InsertTemplateEntityProvider, NoteFromTemplateEntityProvider } from "./Providers/TemplateProvider";

export default class Entities extends Plugin {
	settings: EntitiesSettings;
	suggestor: EntitiesSuggestor;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EntitiesSettingTab(this.app, this));

		this.suggestor = new EntitiesSuggestor(this,[]);		
		this.registerEditorSuggest(this.suggestor);
		this.loadEntityProviders();
	}

	onunload() {}

	async loadEntityProviders() {
		this.suggestor.clearEntityProviders();
		const nldatesProvider = new NLDatesEntityProvider(this);
		if (nldatesProvider) {
			this.suggestor.addEntityProvider(nldatesProvider);
		}

		this.settings.providers.forEach((providerConfig: ProviderConfiguration) => {
			switch (providerConfig.type) {
				case 'folder': {					
					const folderProvider = new FolderEntityProvider(this, providerConfig.settings);
					if (folderProvider) {
						this.suggestor.addEntityProvider(folderProvider);
					}
					break;
				}
				case 'dataview': {
					const dataviewProvider = new DataviewEntityProvider(this, providerConfig.settings);
					if (dataviewProvider) {
						this.suggestor.addEntityProvider(dataviewProvider);
					}
					break;
				} 
				case 'noteFromTemplate': {
					const provider = new NoteFromTemplateEntityProvider(this, providerConfig.settings);
					if (provider) {
						this.suggestor.addEntityProvider(provider);
					}
					break;
				}
				case 'insertTemplate': {
					const provider = new InsertTemplateEntityProvider(this, providerConfig.settings);
					if (provider) {
						this.suggestor.addEntityProvider(provider);
					}
					break;
				}
				default:
					return undefined;
			}
		});
	}

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
