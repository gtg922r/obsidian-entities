import {
	Plugin,
	Setting,
	TFile,
} from "obsidian";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import { entityFromTemplateSettings } from "src/entities.types";

const newProviderTypeID = "newProvider";

export interface NewProviderUserSettings extends EntityProviderUserSettings {
	providerTypeID: string;
	// Add any additional settings here
}

const defaultNewProviderUserSettings: NewProviderUserSettings = {
	providerTypeID: newProviderTypeID,
	enabled: true,
	icon: "icon-name",
	entityCreationTemplates: [],
	// Add default values for additional settings here
};

export class NewEntityProvider extends EntityProvider<NewProviderUserSettings> {
	static readonly providerTypeID: string = newProviderTypeID;

	static getDescription(settings?: NewProviderUserSettings): string {
		if (settings) {
			return `🌐 New Entity Provider (${settings.providerTypeID})`;
		} else {
			return `New Entity Provider`;
		}
	}

	getDescription(): string {
		return NewEntityProvider.getDescription(this.settings);
	}

	static getDefaultSettings(): NewProviderUserSettings {
		return { ...defaultNewProviderUserSettings };
	}

	getDefaultSettings(): NewProviderUserSettings {
		return NewEntityProvider.getDefaultSettings();
	}

	constructor(
		plugin: Plugin,
		settings: Partial<NewProviderUserSettings>
	) {
		super(plugin, settings);
		// Initialize any additional properties or methods here
	}

	getEntityList(query: string): EntitySuggestionItem[] {
		// Implement logic to return a list of entity suggestions based on the query
		return [];
	}

	static buildSummarySetting(
		settingContainer: Setting,
		settings: NewProviderUserSettings,
		onShouldSave: (newSettings: NewProviderUserSettings) => void,
		plugin: Plugin
	): void {
		// Implement logic to build summary settings UI
	}

	static buildSimpleSettings?(
		settingContainer: HTMLElement,
		settings: NewProviderUserSettings,
		onShouldSave: (newSettings: NewProviderUserSettings) => void,
		plugin: Plugin
	): void {
		// Implement logic to build simple settings UI
	}

	static buildAdvancedSettings?(
		settingContainer: HTMLElement,
		settings: NewProviderUserSettings,
		onShouldSave: (newSettings: NewProviderUserSettings) => void,
		plugin: Plugin
	): void {
		// Implement logic to build advanced settings UI
	}
}
