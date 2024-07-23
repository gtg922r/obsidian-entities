import { Plugin, Setting } from "obsidian";
import { EntitySuggestionItem } from "src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings } from "./EntityProvider";
import emojilib from "emojilib";

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
	emojilib
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

console.log("Emoji Dictionary:", emojiDictionary);

const fontAwesomeDictionary: CharacterKeywordDictionary = {
	house: [{ char: "", name: "house" }],
	tree: [{ char: "", name: "tree" }],
	water: [{ char: "", name: "water" }],
	fire: [{ char: "", name: "fire" }],
	earth: [{ char: "", name: "earth_africa" }],
	wind: [{ char: "", name: "wind" }],
};

export class CharacterProvider extends EntityProvider<CharacterProviderUserSettings> {
	readonly emojiDictionary: CharacterKeywordDictionary = emojiDictionary;
	readonly fontAwesomeDictionary: CharacterKeywordDictionary = fontAwesomeDictionary;
	static readonly providerTypeID: string = characterProviderTypeID;

	static getDescription(settings?: CharacterProviderUserSettings): string {
		if (settings) {
			return `⌨️ Character Provider`;
		} else {
			return `Character Provider`;
		}
	}

	getDescription(): string {
		return CharacterProvider.getDescription(this.settings);
	}

	static getDefaultSettings(): CharacterProviderUserSettings {
		return { ...defaultCharacterProviderUserSettings };
	}

	getDefaultSettings(): CharacterProviderUserSettings {
		return CharacterProvider.getDefaultSettings();
	}

	constructor(
		plugin: Plugin,
		settings: Partial<CharacterProviderUserSettings>
	) {
		super(plugin, settings);
		// Initialize any additional properties or methods specific to CharacterProvider here
	}

	private searchDictionary(
		dictionary: CharacterKeywordDictionary,
		query: string,
		prefix: string
	): EntitySuggestionItem[] {
		const results: EntitySuggestionItem[] = [];
		const lowerCaseQuery = query.toLowerCase();

		for (const [keyword, entries] of Object.entries(dictionary)) {
			if (keyword.toLowerCase().includes(lowerCaseQuery)) {
				for (const entry of entries) {
					results.push({
						suggestionText: `${entry.char}: ${prefix}-${entry.name} (${keyword})`,
						replacementText: entry.char,
						icon: this.settings.icon,
						action: async () => entry.char,
					});
				}
			}
		}

		return results;
	}

	getEntityList(query: string): EntitySuggestionItem[] {
		return [
			...(this.settings.suggestEmoji
				? this.searchDictionary(emojiDictionary, query, "em")
				: []),
			...(this.settings.suggestFontAwesome
				? this.searchDictionary(fontAwesomeDictionary, query, "fa")
				: []),
		];
	}

	static buildSummarySetting(
		settingContainer: Setting,
		settings: CharacterProviderUserSettings,
		onShouldSave: (newSettings: CharacterProviderUserSettings) => void,
		plugin: Plugin
	): void {
		// Implement logic to build summary settings UI for CharacterProvider
	}

	static buildSimpleSettings?(
		settingContainer: HTMLElement,
		settings: CharacterProviderUserSettings,
		onShouldSave: (newSettings: CharacterProviderUserSettings) => void,
		plugin: Plugin
	): void {
		new Setting(settingContainer)
			.setName("Suggest Emoji")
			.setDesc("Provide Emoji Suggestion")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.suggestEmoji)
					.onChange(async (value) => {
						settings.suggestEmoji = value;
						onShouldSave(settings);
					})
			);
		new Setting(settingContainer)
			.setName("Suggest Font Awesome")
			.setDesc("Provide Font Awesome Glyph Suggestions")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.suggestFontAwesome)
					.onChange(async (value) => {
						settings.suggestFontAwesome = value;
						onShouldSave(settings);
					})
			);
		// Implement logic to build simple settings UI for CharacterProvider
		// This could include options like character folder path, naming conventions, etc.
	}

	static buildAdvancedSettings?(
		settingContainer: HTMLElement,
		settings: CharacterProviderUserSettings,
		onShouldSave: (newSettings: CharacterProviderUserSettings) => void,
		plugin: Plugin
	): void {
		// Implement logic to build advanced settings UI for CharacterProvider
		// This could include more complex options like custom character attributes, relationships, etc.
	}
}


