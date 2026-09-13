import {
	Plugin,
	Setting,
	TFile,
} from "obsidian";
import { EntitySuggestionItem } from "src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings, ProviderSettingsInput } from "./EntityProvider";
import { cloneSettings } from "src/settingsData";
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
		return cloneSettings(defaultNewProviderUserSettings);
	}

	getDefaultSettings(): NewProviderUserSettings {
		return NewEntityProvider.getDefaultSettings();
	}

	constructor(
		plugin: Plugin,
		settings: ProviderSettingsInput<NewProviderUserSettings>
	) {
		super(plugin, settings);
		// Initialize any additional properties or methods here
	}

	// isQueryDependent defaults to true. Override with false only when this ordinary
	// list is independent of the typed query for fixed settings and trigger.
	// Creation suggestions always stay uncached. Resolve optional APIs here,
	// never by constructor timers. See provider-runtime.md.
	getEntityList(query: string): EntitySuggestionItem[] {
		// Return labels paired with required targets, for example:
		// { suggestionText: file.basename, target: { kind: "file", file } }
		// Keep the live TFile; never resolve or format links from the label.
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
