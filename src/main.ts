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
			// this.providerRegistry.registerProviderType(TemplateEntityProvider)
			.registerProviderType(DateEntityProvider);
	}

	async loadEntityProviders() {
		// const defaultFolderSettings: FolderProviderUserSettings = {
		// 	providerTypeID: FolderEntityProvider.providerTypeID,
		// 	enabled: true,
		// 	icon: "user-circle",
		// 	path: "People",
		// 	entityCreationTemplates: [
		// 		{
		// 			engine: "templater",
		// 			templatePath: "Templater/person template.md",
		// 			entityName: "Person",
		// 		},
		// 	],
		// 	shouldLoadSubFolders: false,
		// 	shouldCreateEntitiesForAliases: false,
		// 	propertyToCreateEntitiesFor: undefined,
		// 	propertyToFilterEntitiesBy: undefined,
		// };

		// const defaultDataviewSettings: DataviewProviderUserSettings = {
		// 	providerTypeID: DataviewEntityProvider.providerTypeID,
		// 	enabled: true,
		// 	icon: "book-marked",
		// 	query: "#project",
		// };

		// const defaultDatesSettings: DatesProviderUserSettings = {
		// 	providerTypeID: DateEntityProvider.providerTypeID,
		// 	enabled: true,
		// 	icon: "calendar",
		// 	shouldCreateIfNotExists: true,
		// 	entityCreationTemplates: [],
		// };

		// this.settings.providerSettings = [
		// 	defaultFolderSettings,
		// 	defaultDataviewSettings,
		// 	defaultDatesSettings,
		// ];
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
