import { Plugin } from "obsidian";
import { EntitiesSettingTab } from "./EntitiesSettings";
import { EntitiesSettings, DEFAULT_SETTINGS } from "./entities.types";
import { EntitiesSuggestor } from "./EntitiesSuggestor";
import ProviderRegistry from "./Providers/ProviderRegistry";
import {
	FolderEntityProvider,
	FolderProviderUserSettings,
} from "./Providers/FolderEntityProvider";
import {
	DataviewEntityProvider,
	DataviewProviderUserSettings,
} from "./Providers/DataviewEntityProvider";
import { TemplateEntityProvider } from "./Providers/TemplateProvider";
import { DateEntityProvider, DatesProviderUserSettings } from "./Providers/DateEntityProvider";
import { EntityProviderUserSettings } from "./Providers/EntityProvider";

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
		this.loadEntityProviders();
	}

	onunload() {}

	async loadEntityProviders() {
		const defaultFolderSettings: FolderProviderUserSettings = {
			providerTypeID: FolderEntityProvider.providerTypeID,
			enabled: true,
			icon: "user-circle",
			path: "People",
			entityCreationTemplates: [
				{
					engine: "templater",
					templatePath: "Templater/person template.md",
					entityName: "Person",
				},
			],
			shouldLoadSubFolders: false,
			shouldCreateEntitiesForAliases: false,
			propertyToCreateEntitiesFor: undefined,
			propertyToFilterEntitiesBy: undefined,
		};

		const defaultDataviewSettings: DataviewProviderUserSettings = {
			providerTypeID: DataviewEntityProvider.providerTypeID,
			enabled: true,
			icon: "book-marked",
			query: "#project",
		};

		const defaultDatesSettings: DatesProviderUserSettings = {
			providerTypeID: DateEntityProvider.providerTypeID,
			enabled: true,
			icon: "calendar",
			shouldCreateIfNotExists: true,
			entityCreationTemplates: [],
		};

		this.providerRegistry
			.registerProviderType(FolderEntityProvider)
			.registerProviderType(DataviewEntityProvider)
			.registerProviderType(TemplateEntityProvider)
			.registerProviderType(DateEntityProvider);

		const defaultProviderSettings = [
			defaultFolderSettings,
			defaultDataviewSettings,
			defaultDatesSettings,
		];

		this.providerRegistry.loadProvidersFromSettings(
			defaultProviderSettings
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
