/**
 * Integration tests for the full suggestion flow
 * Tests provider interactions, trigger priority, and end-to-end behavior
 */
import { App, Editor, EditorSuggestContext, TFile } from "obsidian";
import Entities from "../src/main";
import { EntitiesSuggestor, EntitySuggestionItem } from "../src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings, RefreshBehavior } from "../src/Providers/EntityProvider";
import ProviderRegistry from "../src/Providers/ProviderRegistry";
import { TriggerCharacter } from "../src/entities.types";

jest.mock("obsidian", () => {
	return {
		EditorSuggest: class { close() {} },
		Plugin: class {
			app: jest.MockedObject<App>;
			constructor(app: App) {
				this.app = app;
			}
		},
		prepareFuzzySearch: jest.fn().mockImplementation((query: string) => {
			return (text: string) => {
				if (text.toLowerCase().includes(query.toLowerCase())) {
					return { score: 10, matches: [[0, query.length]] };
				}
				return null;
			};
		}),
	};
});

const mockPlugin = {
	app: {},
} as unknown as Entities;

// Test provider for @ trigger
class AtTriggerProvider extends EntityProvider<EntityProviderUserSettings> {
	static readonly providerTypeID = "atTrigger";
	private items: EntitySuggestionItem[];

	constructor(plugin: any, settings: any, items: EntitySuggestionItem[] = []) {
		super(plugin, settings);
		this.items = items;
	}

	getDefaultSettings(): EntityProviderUserSettings {
		return { providerTypeID: "atTrigger", enabled: true, icon: "at" };
	}

	get triggers(): TriggerCharacter[] {
		return [TriggerCharacter.At];
	}

	getEntityList(): EntitySuggestionItem[] {
		return this.items;
	}

	static getDescription() { return "At Trigger Provider"; }
	static getDefaultSettings() { return { providerTypeID: "atTrigger", enabled: true, icon: "at" }; }
	static buildSummarySetting() {}
}

// Test provider for / trigger
class SlashTriggerProvider extends EntityProvider<EntityProviderUserSettings> {
	static readonly providerTypeID = "slashTrigger";
	private items: EntitySuggestionItem[];

	constructor(plugin: any, settings: any, items: EntitySuggestionItem[] = []) {
		super(plugin, settings);
		this.items = items;
	}

	getDefaultSettings(): EntityProviderUserSettings {
		return { providerTypeID: "slashTrigger", enabled: true, icon: "slash" };
	}

	get triggers(): TriggerCharacter[] {
		return [TriggerCharacter.Slash];
	}

	getEntityList(): EntitySuggestionItem[] {
		return this.items;
	}

	static getDescription() { return "Slash Trigger Provider"; }
	static getDefaultSettings() { return { providerTypeID: "slashTrigger", enabled: true, icon: "slash" }; }
	static buildSummarySetting() {}
}

// Test provider for : trigger
class ColonTriggerProvider extends EntityProvider<EntityProviderUserSettings> {
	static readonly providerTypeID = "colonTrigger";
	private items: EntitySuggestionItem[];

	constructor(plugin: any, settings: any, items: EntitySuggestionItem[] = []) {
		super(plugin, settings);
		this.items = items;
	}

	getDefaultSettings(): EntityProviderUserSettings {
		return { providerTypeID: "colonTrigger", enabled: true, icon: "colon" };
	}

	get triggers(): TriggerCharacter[] {
		return [TriggerCharacter.Colon];
	}

	getEntityList(): EntitySuggestionItem[] {
		return this.items;
	}

	static getDescription() { return "Colon Trigger Provider"; }
	static getDefaultSettings() { return { providerTypeID: "colonTrigger", enabled: true, icon: "colon" }; }
	static buildSummarySetting() {}
}

describe("Integration: Full suggestion flow", () => {
	let suggestor: EntitiesSuggestor;
	let mockEditor: jest.Mocked<Editor>;
	let mockFile: jest.Mocked<TFile>;
	let registry: ProviderRegistry;

	beforeEach(() => {
		// Reset the singleton
		(ProviderRegistry as any).instance = null;
		ProviderRegistry.initializeRegistry(mockPlugin as any);
		registry = ProviderRegistry.getInstance();

		suggestor = new EntitiesSuggestor(mockPlugin, registry);
		mockEditor = {
			getLine: jest.fn(),
		} as unknown as jest.Mocked<Editor>;
		mockFile = {} as unknown as TFile;
	});

	describe("provider filtering by trigger", () => {
		beforeEach(() => {
			// Register and instantiate providers
			registry.registerProviderType(AtTriggerProvider as any);
			registry.registerProviderType(SlashTriggerProvider as any);
			registry.registerProviderType(ColonTriggerProvider as any);

			// Create instances with specific items
			const atProvider = new AtTriggerProvider(mockPlugin, {}, [
				{ suggestionText: "AtItem1" },
				{ suggestionText: "AtItem2" },
			]);
			const slashProvider = new SlashTriggerProvider(mockPlugin, {}, [
				{ suggestionText: "SlashItem1" },
			]);
			const colonProvider = new ColonTriggerProvider(mockPlugin, {}, [
				{ suggestionText: "ColonItem1" },
			]);

			// Manually add providers to registry
			(registry as any).providers = [atProvider, slashProvider, colonProvider];
		});

		test("@ trigger only returns @ providers", async () => {
			mockEditor.getLine.mockReturnValue("@test");
			const trigger = suggestor.onTrigger(
				{ line: 0, ch: 5 },
				mockEditor as Editor,
				mockFile
			);
			expect(trigger).not.toBeNull();

			const context = {
				query: "@test",
				editor: mockEditor,
				file: mockFile,
			} as unknown as EditorSuggestContext;

			const suggestions = await suggestor.getSuggestions(context);
			// Should only have AtItem suggestions
			expect(suggestions.every((s: EntitySuggestionItem) => s.suggestionText.startsWith("AtItem"))).toBe(true);
		});

		test("/ trigger only returns / providers", async () => {
			mockEditor.getLine.mockReturnValue("/test");
			const trigger = suggestor.onTrigger(
				{ line: 0, ch: 5 },
				mockEditor as Editor,
				mockFile
			);
			expect(trigger).not.toBeNull();

			const context = {
				query: "/test",
				editor: mockEditor,
				file: mockFile,
			} as unknown as EditorSuggestContext;

			const suggestions = await suggestor.getSuggestions(context);
			expect(suggestions.every((s: EntitySuggestionItem) => s.suggestionText.startsWith("SlashItem"))).toBe(true);
		});

		test(": trigger only returns : providers", async () => {
			mockEditor.getLine.mockReturnValue(":test");
			const trigger = suggestor.onTrigger(
				{ line: 0, ch: 5 },
				mockEditor as Editor,
				mockFile
			);
			expect(trigger).not.toBeNull();

			const context = {
				query: ":test",
				editor: mockEditor,
				file: mockFile,
			} as unknown as EditorSuggestContext;

			const suggestions = await suggestor.getSuggestions(context);
			expect(suggestions.every((s: EntitySuggestionItem) => s.suggestionText.startsWith("ColonItem"))).toBe(true);
		});
	});

	describe("trigger priority", () => {
		test("@ takes priority over / when both present", () => {
			mockEditor.getLine.mockReturnValue("@date/time");
			const result = suggestor.onTrigger(
				{ line: 0, ch: 10 },
				mockEditor as Editor,
				mockFile
			);

			expect(result).not.toBeNull();
			// Query should start from @, not /
			expect(result!.query).toBe("@date/time");
		});

		test("@ takes priority when in same token as /", () => {
			mockEditor.getLine.mockReturnValue("text @file/path");
			const result = suggestor.onTrigger(
				{ line: 0, ch: 15 },
				mockEditor as Editor,
				mockFile
			);

			expect(result).not.toBeNull();
			expect(result!.query).toBe("@file/path");
		});

		test(": and / are token-scoped triggers", () => {
			mockEditor.getLine.mockReturnValue("text :emoji");
			const result = suggestor.onTrigger(
				{ line: 0, ch: 11 },
				mockEditor as Editor,
				mockFile
			);

			expect(result).not.toBeNull();
			expect(result!.query).toBe(":emoji");
		});
	});

	describe("multi-word queries", () => {
		test("@ allows multi-word queries with spaces", () => {
			mockEditor.getLine.mockReturnValue("@John Doe");
			const result = suggestor.onTrigger(
				{ line: 0, ch: 9 },
				mockEditor as Editor,
				mockFile
			);

			expect(result).not.toBeNull();
			expect(result!.query).toBe("@John Doe");
		});

		test(": is token-scoped (no spaces)", () => {
			mockEditor.getLine.mockReturnValue(":emoji more text");
			const result = suggestor.onTrigger(
				{ line: 0, ch: 6 },
				mockEditor as Editor,
				mockFile
			);

			expect(result).not.toBeNull();
			expect(result!.query).toBe(":emoji");
		});
	});
});

describe("Integration: Provider refresh behavior", () => {
	class RefreshingProvider extends EntityProvider<EntityProviderUserSettings> {
		static callCount = 0;
		static readonly providerTypeID = "refreshing";

		getDefaultSettings(): EntityProviderUserSettings {
			return { providerTypeID: "refreshing", enabled: true, icon: "refresh" };
		}

		getRefreshBehavior(): RefreshBehavior {
			return RefreshBehavior.ShouldRefresh;
		}

		getEntityList(): EntitySuggestionItem[] {
			RefreshingProvider.callCount++;
			return [{ suggestionText: `Item${RefreshingProvider.callCount}` }];
		}

		static getDescription() { return "Refreshing Provider"; }
		static getDefaultSettings() { return { providerTypeID: "refreshing", enabled: true, icon: "refresh" }; }
		static buildSummarySetting() {}
	}

	class NeverRefreshProvider extends EntityProvider<EntityProviderUserSettings> {
		static callCount = 0;
		static readonly providerTypeID = "neverRefresh";

		getDefaultSettings(): EntityProviderUserSettings {
			return { providerTypeID: "neverRefresh", enabled: true, icon: "static" };
		}

		getRefreshBehavior(): RefreshBehavior {
			return RefreshBehavior.Never;
		}

		getEntityList(): EntitySuggestionItem[] {
			NeverRefreshProvider.callCount++;
			return [{ suggestionText: `Static${NeverRefreshProvider.callCount}` }];
		}

		static getDescription() { return "Never Refresh Provider"; }
		static getDefaultSettings() { return { providerTypeID: "neverRefresh", enabled: true, icon: "static" }; }
		static buildSummarySetting() {}
	}

	let suggestor: EntitiesSuggestor;
	let registry: ProviderRegistry;

	beforeEach(() => {
		RefreshingProvider.callCount = 0;
		NeverRefreshProvider.callCount = 0;

		(ProviderRegistry as any).instance = null;
		ProviderRegistry.initializeRegistry(mockPlugin as any);
		registry = ProviderRegistry.getInstance();
		suggestor = new EntitiesSuggestor(mockPlugin, registry);
	});

	test("ShouldRefresh providers are called on every getSuggestions", () => {
		const provider = new RefreshingProvider(mockPlugin, {});
		(registry as any).providers = [provider];

		const context = {
			query: "@test",
			editor: {},
			file: {},
		} as unknown as EditorSuggestContext;

		suggestor.getSuggestions(context);
		const firstCount = RefreshingProvider.callCount;

		suggestor.getSuggestions(context);
		const secondCount = RefreshingProvider.callCount;

		expect(secondCount).toBeGreaterThan(firstCount);
	});

	test("Never refresh providers cache results", () => {
		const provider = new NeverRefreshProvider(mockPlugin, {});
		(registry as any).providers = [provider];

		const context = {
			query: "@test",
			editor: {},
			file: {},
		} as unknown as EditorSuggestContext;

		suggestor.getSuggestions(context);
		const firstCount = NeverRefreshProvider.callCount;

		suggestor.getSuggestions(context);
		const secondCount = NeverRefreshProvider.callCount;

		// Should only be called once since Never means cache forever
		expect(secondCount).toBe(firstCount);
	});
});

describe("Integration: Suggestion selection", () => {
	let suggestor: EntitiesSuggestor;
	let registry: ProviderRegistry;

	beforeEach(() => {
		(ProviderRegistry as any).instance = null;
		ProviderRegistry.initializeRegistry(mockPlugin as any);
		registry = ProviderRegistry.getInstance();
		suggestor = new EntitiesSuggestor(mockPlugin, registry);
	});

	test("selecting item without action inserts wiki link", () => {
		const mockEditor = {
			replaceRange: jest.fn(),
			setCursor: jest.fn(),
			posToOffset: jest.fn().mockReturnValue(0),
			offsetToPos: jest.fn().mockReturnValue({ line: 0, ch: 12 }),
		} as unknown as jest.Mocked<Editor>;

		const context = {
			editor: mockEditor,
			start: { line: 0, ch: 1 },
			end: { line: 0, ch: 5 },
			query: "@test",
		} as unknown as EditorSuggestContext;

		(suggestor as any).context = context;

		const suggestion: EntitySuggestionItem = {
			suggestionText: "TestNote",
		};

		suggestor.selectSuggestion(suggestion, {} as MouseEvent);

		expect(mockEditor.replaceRange).toHaveBeenCalledWith(
			"[[TestNote]]",
			{ line: 0, ch: 0 },
			{ line: 0, ch: 5 }
		);
	});

	test("selecting item with replacementText uses it in link", () => {
		const mockEditor = {
			replaceRange: jest.fn(),
			setCursor: jest.fn(),
			posToOffset: jest.fn().mockReturnValue(0),
			offsetToPos: jest.fn().mockReturnValue({ line: 0, ch: 18 }),
		} as unknown as jest.Mocked<Editor>;

		const context = {
			editor: mockEditor,
			start: { line: 0, ch: 1 },
			end: { line: 0, ch: 5 },
			query: "@test",
		} as unknown as EditorSuggestContext;

		(suggestor as any).context = context;

		const suggestion: EntitySuggestionItem = {
			suggestionText: "Ali",
			replacementText: "Alice|Ali",
		};

		suggestor.selectSuggestion(suggestion, {} as MouseEvent);

		expect(mockEditor.replaceRange).toHaveBeenCalledWith(
			"[[Alice|Ali]]",
			{ line: 0, ch: 0 },
			{ line: 0, ch: 5 }
		);
	});

	test("selecting item with action calls action", async () => {
		const actionMock = jest.fn().mockReturnValue("custom result");

		const mockEditor = {
			replaceRange: jest.fn(),
			setCursor: jest.fn(),
			posToOffset: jest.fn().mockReturnValue(0),
			offsetToPos: jest.fn().mockReturnValue({ line: 0, ch: 13 }),
		} as unknown as jest.Mocked<Editor>;

		const context = {
			editor: mockEditor,
			start: { line: 0, ch: 1 },
			end: { line: 0, ch: 5 },
			query: "@test",
		} as unknown as EditorSuggestContext;

		(suggestor as any).context = context;

		const suggestion: EntitySuggestionItem = {
			suggestionText: "Action Item",
			action: actionMock,
		};

		suggestor.selectSuggestion(suggestion, {} as MouseEvent);

		expect(actionMock).toHaveBeenCalledWith(suggestion, context);
	});
});
