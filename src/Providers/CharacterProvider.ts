import type { ProviderSettingsContext } from "../ui/providerSettings";
import { cloneSettings } from "../settingsData";
import { Plugin } from "obsidian";
import { EntitySuggestionItem } from "src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings, ProviderSettingsInput } from "./EntityProvider";
import emojilib from "emojilib";
import { TriggerCharacter } from "../entities.types";

const characterProviderTypeID = "characterProvider";

export interface CharacterProviderUserSettings
	extends EntityProviderUserSettings {
	providerTypeID: string;
	suggestEmoji: boolean;
	suggestFontAwesome: boolean;
	// Add any character-specific settings here if needed
}

const defaultCharacterProviderUserSettings: CharacterProviderUserSettings = {
	providerTypeID: characterProviderTypeID,
	enabled: true,
	icon: "keyboard",
	entityCreationTemplates: [],
	suggestEmoji: true,
	suggestFontAwesome: true,
	// Add default values for any additional character-specific settings here
};

interface CharacterEntry {
	char: string;
	name: string;
}

interface CharacterKeywordDictionary {
	[key: string]: CharacterEntry[];
}

const emojiDictionary: CharacterKeywordDictionary = Object.entries(
	emojilib ?? {}
).reduce((acc, [emoji, keywords]) => {
	if (Array.isArray(keywords) && keywords.length > 0) {
		const primaryName = keywords[0];
		keywords.forEach((keyword) => {
			if (!acc[keyword]) {
				acc[keyword] = [];
			}
			acc[keyword].push({ char: emoji, name: primaryName });
		});
	}
	return acc;
}, {} as CharacterKeywordDictionary);

const fontAwesomeDictionary = require("./fontAwesomeDictionary.json") as CharacterKeywordDictionary;


export class CharacterProvider extends EntityProvider<CharacterProviderUserSettings> {
	readonly emojiDictionary: CharacterKeywordDictionary = emojiDictionary;
	readonly fontAwesomeDictionary: CharacterKeywordDictionary = fontAwesomeDictionary;
	static readonly providerTypeID: string = characterProviderTypeID;

	static getDescription(settings?: CharacterProviderUserSettings): string {
		if (settings) {
			return `⌨️ Character provider`;
		} else {
			return `Character provider`;
		}
	}

	getDescription(): string {
		return CharacterProvider.getDescription(this.settings);
	}

	static getDefaultSettings(): CharacterProviderUserSettings {
		return cloneSettings(defaultCharacterProviderUserSettings);
	}

	getDefaultSettings(): CharacterProviderUserSettings {
		return CharacterProvider.getDefaultSettings();
	}

	constructor(
		plugin: Plugin,
		settings: ProviderSettingsInput<CharacterProviderUserSettings>
	) {
		super(plugin, settings);
		// Initialize any additional properties or methods specific to CharacterProvider here
	}

	private getSuggestionsFromDictionary(
		dictionary: CharacterKeywordDictionary,
		query: string,
		prefix: string
	): EntitySuggestionItem[] {
		const results: EntitySuggestionItem[] = [];
		const lowerCaseQuery = query.toLowerCase();

		for (const [keyword, entries] of Object.entries(dictionary)) {
			const normalizedKeyword = keyword.toLowerCase().replace(/_/g, " ");
			if (normalizedKeyword.includes(lowerCaseQuery)) {
				for (const entry of entries) {
					const isSynonym = keyword !== entry.name;
					results.push({
						// suggestionText: `${entry.char}: ${prefix}-${entry.name} (${keyword})`,
						// suggestionText: `${entry.name} (${prefix}: ${keyword})`,
						suggestionText: `${entry.name} (${prefix})${isSynonym ? ` for "${keyword}"` : ''}`,
						target: { kind: "text", text: entry.char },
						// icon: this.settings.icon,
						flair: entry.char,
						// flair: prefix,
					});
				}
			}
		}

		return results;
	}

	get triggers(): TriggerCharacter[] {
		return [TriggerCharacter.Colon]; // Specify the ':' trigger
	}

	getEntityList(query: string, trigger: TriggerCharacter): EntitySuggestionItem[] {
		if (trigger === TriggerCharacter.Colon) {
			return [
				...(this.settings.suggestEmoji
					? this.getSuggestionsFromDictionary(emojiDictionary, query, "em")
					: []),
				...(this.settings.suggestFontAwesome
					? this.getSuggestionsFromDictionary(fontAwesomeDictionary, query, "fa")
					: []),
			];
		}
		return [];
	}

	static getSettingDefinitions(context: ProviderSettingsContext<CharacterProviderUserSettings>) {
		return [
			context.field("suggestEmoji", "Suggest emoji", "Provide emoji suggestions.", (setting, field) => {
				setting.addToggle(toggle => toggle.setValue(field.value).onChange(value => field.set(value)));
			}),
			context.field("suggestFontAwesome", "Suggest Font Awesome", "Provide Font Awesome glyph suggestions.", (setting, field) => {
				setting.addToggle(toggle => toggle.setValue(field.value).onChange(value => field.set(value)));
			}),
		];
	}

}
