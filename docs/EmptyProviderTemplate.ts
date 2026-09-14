/**
 * Copy to src/Providers/NewEntityProvider.ts, choose a unique provider type ID,
 * and register the class in main.ts. The project's src imports work in either location.
 */
import type { SettingDefinitionItem } from "obsidian";
import { EntityProvider, EntityProviderUserSettings } from "src/Providers/EntityProvider";
import type { EntitySuggestionItem } from "src/suggestion.types";
import { cloneSettings } from "src/settingsData";
import type { ProviderSettingsContext } from "src/ui/providerSettings";

const newProviderTypeID = "newProvider";

/** Configuration for a small provider that suggests one literal text value. */
export interface NewProviderUserSettings extends EntityProviderUserSettings {
	text: string;
}

const defaultNewProviderUserSettings: NewProviderUserSettings = {
	providerTypeID: newProviderTypeID,
	enabled: true,
	icon: "text-cursor-input",
	text: "Hello!",
};

/** Minimal synchronous provider with a meaningful native scalar setting. */
export class NewEntityProvider extends EntityProvider<NewProviderUserSettings> {
	static readonly providerTypeID = newProviderTypeID;

	static getDescription(): string { return "Literal text"; }

	static getDefaultSettings(): NewProviderUserSettings {
		// The settings store supplies each configured instance's ID.
		return cloneSettings(defaultNewProviderUserSettings);
	}

	getDefaultSettings(): NewProviderUserSettings { return NewEntityProvider.getDefaultSettings(); }

	// This ordinary list depends only on settings; creation suggestions stay uncached.
	get isQueryDependent(): boolean { return false; }

	getEntityList(): EntitySuggestionItem[] {
		const text = this.settings.text;
		// File entities use { kind: "file", file: liveFile }, never a link built from the label.
		// Actions use a typed action target and return ActionResult; providers never edit an Editor.
		return text ? [{ suggestionText: text, icon: this.settings.icon, target: { kind: "text", text } }] : [];
	}

	static getSettingDefinitions(context: ProviderSettingsContext<NewProviderUserSettings>): SettingDefinitionItem[] {
		return [context.field("text", "Text to insert", "Literal text suggested by this provider.", (setting, field) => {
			setting.addText(input => {
				input.setValue(field.value).onChange(value => field.set(value));
				field.captureText(input.inputEl);
			});
		})];
	}
}
