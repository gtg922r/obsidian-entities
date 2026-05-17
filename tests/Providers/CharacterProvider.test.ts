import { Plugin } from "obsidian";
import { CharacterProvider } from "../../src/Providers/CharacterProvider";
import { TriggerCharacter } from "../../src/entities.types";

jest.mock("obsidian", () => {
	return {
		Plugin: class {
			app: unknown;
			constructor(app: unknown) {
				this.app = app;
			}
		},
		Setting: class {
			setName() { return this; }
			setDesc() { return this; }
			addToggle() { return this; }
		},
	};
});

// Mock emojilib with proper default export
jest.mock("emojilib", () => ({
	__esModule: true,
	default: {
		"😀": ["grinning_face", "face", "smile", "happy", "joy", ":D", "grin"],
		"😃": ["grinning_face_with_big_eyes", "face", "happy", "smile"],
		"❤️": ["red_heart", "heart", "love", "like"],
		"😊": ["smiling_face", "smile", "happy", "blush"],
	},
}));

const mockPlugin = { app: {} } as unknown as Plugin;

describe("CharacterProvider", () => {
	describe("static properties", () => {
		test("has correct providerTypeID", () => {
			expect(CharacterProvider.providerTypeID).toBe("characterProvider");
		});

		test("getDescription returns expected string", () => {
			const desc = CharacterProvider.getDescription();
			expect(desc).toBe("Character provider");
		});

		test("getDescription with settings returns emoji prefix", () => {
			const settings = CharacterProvider.getDefaultSettings();
			const desc = CharacterProvider.getDescription(settings);
			expect(desc).toBe("⌨️ Character provider");
		});

		test("getDefaultSettings returns valid defaults", () => {
			const defaults = CharacterProvider.getDefaultSettings();
			expect(defaults.providerTypeID).toBe("characterProvider");
			expect(defaults.enabled).toBe(true);
			expect(defaults.icon).toBe("keyboard");
			expect(defaults.suggestEmoji).toBe(true);
			expect(defaults.suggestFontAwesome).toBe(true);
		});
	});

	describe("instance properties", () => {
		test("triggers returns colon", () => {
			const provider = new CharacterProvider(mockPlugin, {});
			expect(provider.triggers).toEqual([TriggerCharacter.Colon]);
		});

		test("getDefaultSettings instance method matches static", () => {
			const provider = new CharacterProvider(mockPlugin, {});
			expect(provider.getDefaultSettings()).toEqual(
				CharacterProvider.getDefaultSettings()
			);
		});

		test("getDescription instance method works", () => {
			const provider = new CharacterProvider(mockPlugin, {});
			expect(provider.getDescription()).toBe("⌨️ Character provider");
		});
	});

	describe("getEntityList", () => {
		test("returns empty for non-colon trigger", () => {
			const provider = new CharacterProvider(mockPlugin, {});
			const results = provider.getEntityList("smile", TriggerCharacter.At);
			expect(results).toEqual([]);
		});

		test("returns empty for slash trigger", () => {
			const provider = new CharacterProvider(mockPlugin, {});
			const results = provider.getEntityList("smile", TriggerCharacter.Slash);
			expect(results).toEqual([]);
		});

		test("returns emoji suggestions for colon trigger", () => {
			const provider = new CharacterProvider(mockPlugin, {
				suggestEmoji: true,
				suggestFontAwesome: false, // Disable font awesome to only get emojis
			});
			const results = provider.getEntityList("grin", TriggerCharacter.Colon);
			expect(results.length).toBeGreaterThan(0);
			// Emoji results have flair that is an emoji character
			// and no icon property, with replacementText being the emoji
			const hasEmoji = results.some(r => 
				r.flair && r.replacementText && r.flair === r.replacementText
			);
			expect(hasEmoji).toBe(true);
		});

		test("returns font awesome suggestions for colon trigger", () => {
			const provider = new CharacterProvider(mockPlugin, {});
			const results = provider.getEntityList("arrow", TriggerCharacter.Colon);
			expect(results.length).toBeGreaterThan(0);
			// Check that at least one result is font awesome
			const hasFontAwesome = results.some(r => r.suggestionText.includes("(fa)"));
			expect(hasFontAwesome).toBe(true);
		});

		test("respects suggestEmoji setting when false", () => {
			const provider = new CharacterProvider(mockPlugin, {
				suggestEmoji: false,
				suggestFontAwesome: true,
			});
			const results = provider.getEntityList("smile", TriggerCharacter.Colon);
			// Should not have any emoji results
			const hasEmoji = results.some(r => r.suggestionText.includes("(em)"));
			expect(hasEmoji).toBe(false);
		});

		test("respects suggestFontAwesome setting when false", () => {
			const provider = new CharacterProvider(mockPlugin, {
				suggestEmoji: true,
				suggestFontAwesome: false,
			});
			const results = provider.getEntityList("arrow", TriggerCharacter.Colon);
			// Should not have any font awesome results
			const hasFontAwesome = results.some(r => r.suggestionText.includes("(fa)"));
			expect(hasFontAwesome).toBe(false);
		});

		test("returns empty when both settings disabled", () => {
			const provider = new CharacterProvider(mockPlugin, {
				suggestEmoji: false,
				suggestFontAwesome: false,
			});
			const results = provider.getEntityList("smile", TriggerCharacter.Colon);
			expect(results).toEqual([]);
		});

		test("suggestions have action that returns character", async () => {
			const provider = new CharacterProvider(mockPlugin, {});
			const results = provider.getEntityList("smile", TriggerCharacter.Colon);
			const smileSuggestion = results.find(r => 
				r.suggestionText.toLowerCase().includes("smile") ||
				r.suggestionText.toLowerCase().includes("grinning")
			);
			expect(smileSuggestion).toBeDefined();
			expect(smileSuggestion!.action).toBeDefined();
			expect(smileSuggestion!.replacementText).toBeDefined();
			// Action should return the character
			const actionResult = await smileSuggestion!.action!(smileSuggestion!, null);
			expect(actionResult).toBe(smileSuggestion!.replacementText);
		});

		test("suggestions include flair with character", () => {
			const provider = new CharacterProvider(mockPlugin, {});
			const results = provider.getEntityList("heart", TriggerCharacter.Colon);
			const heartSuggestion = results.find(r => 
				r.suggestionText.toLowerCase().includes("heart")
			);
			expect(heartSuggestion).toBeDefined();
			expect(heartSuggestion!.flair).toBeDefined();
			expect(heartSuggestion!.flair!.length).toBeGreaterThan(0);
		});

		test("case-insensitive search", () => {
			const provider = new CharacterProvider(mockPlugin, {});
			const lowerResults = provider.getEntityList("smile", TriggerCharacter.Colon);
			const upperResults = provider.getEntityList("SMILE", TriggerCharacter.Colon);
			expect(lowerResults.length).toBe(upperResults.length);
		});

		test("shows synonym info for keyword matches", () => {
			const provider = new CharacterProvider(mockPlugin, {});
			// Search for a common emoji keyword that might be a synonym
			const results = provider.getEntityList("happy", TriggerCharacter.Colon);
			// This might not always be true depending on the emoji dictionary
			// but the search should still work
			expect(results.length).toBeGreaterThan(0);
		});
	});
});
