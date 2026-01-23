import { Plugin } from "obsidian";
import {
	EntityProvider,
	EntityProviderUserSettings,
	RefreshBehavior,
} from "../../src/Providers/EntityProvider";
import { TriggerCharacter } from "../../src/entities.types";
import { EntitySuggestionItem } from "../../src/EntitiesSuggestor";

// Mock Obsidian
jest.mock("obsidian", () => ({
	Plugin: class {
		app: unknown;
		constructor(app: unknown) {
			this.app = app;
		}
	},
}));

// Mock entitiesUtilities
jest.mock("../../src/entitiesUtilities", () => ({
	createNewNoteFromTemplate: jest.fn().mockResolvedValue(undefined),
}));

// Test implementation of EntityProvider
interface TestProviderSettings extends EntityProviderUserSettings {
	providerTypeID: "testProvider";
	testOption: string;
}

const defaultTestSettings: TestProviderSettings = {
	providerTypeID: "testProvider",
	enabled: true,
	icon: "test-icon",
	testOption: "default",
};

class TestEntityProvider extends EntityProvider<TestProviderSettings> {
	static readonly providerTypeID = "testProvider";

	getDefaultSettings(): TestProviderSettings {
		return { ...defaultTestSettings };
	}

	getEntityList(query: string, trigger: TriggerCharacter): EntitySuggestionItem[] {
		return [
			{ suggestionText: `Test: ${query}` },
			{ suggestionText: "Static suggestion" },
		];
	}
}

class CustomTriggerProvider extends EntityProvider<TestProviderSettings> {
	getDefaultSettings(): TestProviderSettings {
		return { ...defaultTestSettings };
	}

	getEntityList(): EntitySuggestionItem[] {
		return [];
	}

	get triggers(): TriggerCharacter[] {
		return [TriggerCharacter.Slash, TriggerCharacter.Colon];
	}
}

class RefreshBehaviorProvider extends EntityProvider<TestProviderSettings> {
	private behavior: RefreshBehavior;

	constructor(plugin: Plugin, settings: Partial<TestProviderSettings>, behavior: RefreshBehavior) {
		super(plugin, settings);
		this.behavior = behavior;
	}

	getDefaultSettings(): TestProviderSettings {
		return { ...defaultTestSettings };
	}

	getEntityList(): EntitySuggestionItem[] {
		return [];
	}

	getRefreshBehavior(): RefreshBehavior {
		return this.behavior;
	}
}

const mockPlugin = {
	app: {
		vault: {
			getAbstractFileByPath: jest.fn(),
		},
	},
} as unknown as Plugin;

describe("EntityProvider base class", () => {
	describe("constructor and settings", () => {
		test("merges provided settings with defaults", () => {
			const provider = new TestEntityProvider(mockPlugin, {
				testOption: "custom",
			});
			// Access settings via a protected property workaround
			const settings = (provider as any).settings;
			expect(settings.testOption).toBe("custom");
			expect(settings.enabled).toBe(true); // from defaults
			expect(settings.icon).toBe("test-icon"); // from defaults
		});

		test("uses defaults when no settings provided", () => {
			const provider = new TestEntityProvider(mockPlugin, {});
			const settings = (provider as any).settings;
			expect(settings.testOption).toBe("default");
			expect(settings.providerTypeID).toBe("testProvider");
		});

		test("stores plugin reference", () => {
			const provider = new TestEntityProvider(mockPlugin, {});
			expect(provider.plugin).toBe(mockPlugin);
		});
	});

	describe("triggers", () => {
		test("default triggers returns At", () => {
			const provider = new TestEntityProvider(mockPlugin, {});
			expect(provider.triggers).toEqual([TriggerCharacter.At]);
		});

		test("custom triggers can be specified", () => {
			const provider = new CustomTriggerProvider(mockPlugin, {});
			expect(provider.triggers).toEqual([
				TriggerCharacter.Slash,
				TriggerCharacter.Colon,
			]);
		});
	});

	describe("getRefreshBehavior", () => {
		test("default is RefreshBehavior.Default", () => {
			const provider = new TestEntityProvider(mockPlugin, {});
			expect(provider.getRefreshBehavior()).toBe(RefreshBehavior.Default);
		});

		test("can return ShouldRefresh", () => {
			const provider = new RefreshBehaviorProvider(
				mockPlugin,
				{},
				RefreshBehavior.ShouldRefresh
			);
			expect(provider.getRefreshBehavior()).toBe(RefreshBehavior.ShouldRefresh);
		});

		test("can return Never", () => {
			const provider = new RefreshBehaviorProvider(
				mockPlugin,
				{},
				RefreshBehavior.Never
			);
			expect(provider.getRefreshBehavior()).toBe(RefreshBehavior.Never);
		});
	});

	describe("getEntityList", () => {
		test("returns suggestions with query", () => {
			const provider = new TestEntityProvider(mockPlugin, {});
			const results = provider.getEntityList("myquery", TriggerCharacter.At);
			expect(results).toHaveLength(2);
			expect(results[0].suggestionText).toBe("Test: myquery");
			expect(results[1].suggestionText).toBe("Static suggestion");
		});
	});

	describe("getTemplateCreationSuggestions", () => {
		test("returns empty array when no templates configured", () => {
			const provider = new TestEntityProvider(mockPlugin, {});
			const results = provider.getTemplateCreationSuggestions("test");
			expect(results).toEqual([]);
		});

		test("returns empty array for non-templater engines", () => {
			const provider = new TestEntityProvider(mockPlugin, {
				entityCreationTemplates: [
					{
						engine: "core",
						templatePath: "templates/test.md",
						entityName: "Test",
					},
					{
						engine: "disabled",
						templatePath: "templates/disabled.md",
						entityName: "Disabled",
					},
				],
			});
			const results = provider.getTemplateCreationSuggestions("test");
			expect(results).toEqual([]);
		});

		test("returns suggestions for templater engine", () => {
			const provider = new TestEntityProvider(mockPlugin, {
				entityCreationTemplates: [
					{
						engine: "templater",
						templatePath: "templates/person.md",
						entityName: "Person",
						folderPath: "People",
					},
				],
			});
			const results = provider.getTemplateCreationSuggestions("John Doe");
			expect(results).toHaveLength(1);
			expect(results[0].suggestionText).toBe("New Person: John Doe");
			expect(results[0].icon).toBe("plus-circle");
			expect(results[0].action).toBeDefined();
			expect(results[0].match?.score).toBe(-10);
		});

		test("filters to only templater templates", () => {
			const provider = new TestEntityProvider(mockPlugin, {
				entityCreationTemplates: [
					{
						engine: "templater",
						templatePath: "templates/person.md",
						entityName: "Person",
					},
					{
						engine: "core",
						templatePath: "templates/note.md",
						entityName: "Note",
					},
					{
						engine: "templater",
						templatePath: "templates/project.md",
						entityName: "Project",
					},
				],
			});
			const results = provider.getTemplateCreationSuggestions("Test");
			expect(results).toHaveLength(2);
			expect(results[0].suggestionText).toBe("New Person: Test");
			expect(results[1].suggestionText).toBe("New Project: Test");
		});

		test("template action returns link to new note", async () => {
			const provider = new TestEntityProvider(mockPlugin, {
				entityCreationTemplates: [
					{
						engine: "templater",
						templatePath: "templates/person.md",
						entityName: "Person",
					},
				],
			});
			const results = provider.getTemplateCreationSuggestions("Alice");
			const action = results[0].action!;
			// Note: action is async and calls createNewNoteFromTemplate
			const result = await action(results[0], null);
			expect(result).toBe("[[Alice]]");
		});
	});
});

describe("RefreshBehavior enum", () => {
	test("has expected values", () => {
		expect(RefreshBehavior.ShouldRefresh).toBe("shouldRefresh");
		expect(RefreshBehavior.Default).toBe("default");
		expect(RefreshBehavior.Never).toBe("never");
	});
});
