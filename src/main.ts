import { Plugin } from "obsidian";
import { EntitiesSettingTab } from "./EntitiesSettings";
import { EntitiesSettings, DEFAULT_SETTINGS } from "./entities.types";
import { EntitiesSuggestor } from "./EntitiesSuggestor";
import ProviderRegistry from "./Providers/ProviderRegistry";
import {
	FolderEntityProvider
} from "./Providers/FolderEntityProvider";
import {
	DataviewEntityProvider
} from "./Providers/DataviewEntityProvider";
import { TemplateEntityProvider } from "./Providers/TemplateProvider";
import { DateEntityProvider } from "./Providers/DateEntityProvider";

export default class Entities extends Plugin {
	settings: EntitiesSettings;
	suggestor: EntitiesSuggestor;
	providerRegistry: ProviderRegistry;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EntitiesSettingTab(this.app, this));

		this.providerRegistry = ProviderRegistry.initializeRegistry(this);
		this.suggestor = new EntitiesSuggestor(this, this.providerRegistry);
		this.registerEditorSuggest(this.suggestor);
		this.registerEntityProviders();
		this.loadEntityProviders();
	}

	onunload() {}

	registerEntityProviders() {
		this.providerRegistry
			.registerProviderType(FolderEntityProvider)
			.registerProviderType(DataviewEntityProvider)
			.registerProviderType(TemplateEntityProvider)
			.registerProviderType(DateEntityProvider);
	}

	async loadEntityProviders() {
		this.providerRegistry.resetProviders();
		this.providerRegistry.instantiateProvidersFromSettings(
			this.settings.providerSettings
		);
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
