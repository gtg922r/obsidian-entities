import { EditorBindings } from "../src/editorBindings";
import { destroyTestEditors, mountTestEditor, TestEvents } from "./editorTestHarness";
import { App, Editor, EditorSuggestContext, TFile } from "obsidian";
import Entities from "../src/main";
import { EntitiesSuggestor } from "../src/EntitiesSuggestor";
import { EntitySuggestionItem } from "../src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings, RefreshBehavior } from "../src/Providers/EntityProvider";
import ProviderRegistry from "../src/Providers/ProviderRegistry";
import { TriggerCharacter } from "../src/entities.types";

// Mocking the necessary Obsidian interfaces and classes inline
jest.mock("obsidian", () => {
    return {
		...jest.requireActual("./__mocks__/obsidian"),
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

// Creating a mock for the Entities plugin
const mockPlugin = {
	app: {}, // Mock the app object as needed
} as unknown as Entities;

describe("onTrigger grammar on a live public binding", () => {
	afterEach(destroyTestEditors);
	test.each([
		["@", "@"], [":", ":"], ["/", "/"], ["/usr", "/usr"],
		["Hello @Bob Hope", "@Bob Hope"], ["@8/17", "@8/17"], ["@folder/name", "@folder/name"],
		["@Zoë 東京", "@Zoë 東京"], ["# @Bob", "@Bob"], ["- @Bob", "@Bob"], ["> @Bob", "@Bob"],
		["@note /open", "/open"], ["@Bob :cat", ":cat"], ["@Bob /todo ", null], ["@Bob :cat more", null],
		["@Bob /usr/local", null], ["@Bob @   ", null], ["@   ", null], [":cat ", null],
		["bob@example.com", null], ["https://example.com/", null], ["C:/notes/todo", null],
		["mailto:bob@example.com", null], ["http://localhost:3000/", null], ["../folder/todo", null],
		["/usr/local", null], ["//host", null], ["word/command", null], ["a/b/c", null], ["word/", null],
		["some text word/cmd", null], ["\\@Bob", null], ["\\:cat", null], ["\\/todo", null], ["(@Bob)", null],
		["bob@example.com /todo", "/todo"], ["https://example.com/ @Alice", "@Alice"],
		["text @first @second", "@second"], ["plain prose", null], ["", null],
		["@Bob ordinary prose ", "@Bob ordinary prose "], ["@Bob\tHope", "@Bob\tHope"],
	])("%s → %s", (text, query) => {
		const app = { workspace: new TestEvents() } as unknown as App;
		const bindings = new EditorBindings(app);
		const registry = { onChange: () => () => {} } as unknown as ProviderRegistry;
		const suggestor = new EntitiesSuggestor({ app } as Entities, registry, bindings);
		const file = new TFile();
		const mounted = mountTestEditor(app, bindings, file, text!);
		const result = suggestor.onTrigger(mounted.editor.getCursor(), mounted.editor, file);
		expect(result).toEqual(query === null ? null : { start: { line: 0, ch: text!.lastIndexOf(query) + 1 }, end: { line: 0, ch: text!.length }, query });
	});

	test("validates a mid-line cursor and excludes text to its right", () => {
		const app = { workspace: new TestEvents() } as unknown as App, file = new TFile();
		const bindings = new EditorBindings(app);
		const suggestor = new EntitiesSuggestor({ app } as Entities, { onChange: () => () => {} } as unknown as ProviderRegistry, bindings);
		const { editor } = mountTestEditor(app, bindings, file, "some text @keyword and more", "@keyword");
		expect(suggestor.onTrigger(editor.getCursor(), editor, file)).toEqual({ start: { line: 0, ch: 11 }, end: { line: 0, ch: 18 }, query: "@keyword" });
	});
});

describe("getSuggestions tests", () => {
    let suggestor: EntitiesSuggestor;
    let mockEditor: jest.Mocked<Editor>;
    let mockFile: jest.Mocked<TFile>;
    let mockEntityProvider: jest.Mocked<EntityProvider<EntityProviderUserSettings>>;
    let mockRegistry: jest.Mocked<ProviderRegistry>;

    beforeEach(() => {
        // Mocking the ProviderRegistry
        mockRegistry = {
            onChange: jest.fn().mockReturnValue(() => {}),
			revision: 1,
			getProviders: jest.fn(),
			getProvidersForTrigger: jest.fn(),
        } as unknown as jest.Mocked<ProviderRegistry>;

        suggestor = new EntitiesSuggestor(mockPlugin, mockRegistry);

        // Mocking the editor instance
        mockEditor = {
            getLine: jest.fn(),
        } as unknown as jest.Mocked<Editor>;

        // Mocking the TFile instance
        mockFile = {} as unknown as TFile;

        // Mocking EntityProvider
        mockEntityProvider = {
            providerInstanceId: "mock-instance",
			isQueryDependent: true,
			getEntityList: jest.fn(),
            getTemplateCreationSuggestions: jest.fn(),
			getRefreshBehavior: jest.fn(),
        } as unknown as jest.Mocked<EntityProvider<EntityProviderUserSettings>>;

        mockRegistry.getProviders.mockReturnValue([mockEntityProvider]);
		mockRegistry.getProvidersForTrigger.mockReturnValue([mockEntityProvider]);
    });

    test("getSuggestions should return a list of suggestions based on the query", () => {
        const context = {
            query: "@test",
            editor: mockEditor,
            file: mockFile,
        } as unknown as EditorSuggestContext;

        const expectedSuggestions: EntitySuggestionItem[] = [
            {
                suggestionText: "Test suggestion", target: { kind: "unresolved-link" as const, linkpath: "Test suggestion" },
            },
        ];

		const expectedSuggestionsWithMatches: EntitySuggestionItem[] = [
			{
				suggestionText: "Test suggestion", target: { kind: "unresolved-link" as const, linkpath: "Test suggestion" },
				match: { score: 10, matches: [[0, 4]] },
			},
		];

        mockEntityProvider.getEntityList.mockReturnValue(expectedSuggestions);
        mockEntityProvider.getTemplateCreationSuggestions.mockReturnValue([]);
		mockEntityProvider.getRefreshBehavior.mockReturnValue(RefreshBehavior.Default);

        const result = suggestor.getSuggestions(context);

        expect(result).toEqual(expectedSuggestionsWithMatches);
        expect(mockEntityProvider.getEntityList).toHaveBeenCalledWith("test", TriggerCharacter.At);
    });

    test("getSuggestions should include template creation suggestions", () => {
        const context = {
            query: "@note",
            editor: mockEditor,
            file: mockFile,
        } as unknown as EditorSuggestContext;

        const entitySuggestions: EntitySuggestionItem[] = [
            {
                suggestionText: "Note suggestion", target: { kind: "unresolved-link" as const, linkpath: "Note suggestion" },
                match: { score: 5, matches: [] },
            },
        ];

        const templateSuggestions: EntitySuggestionItem[] = [
            {
                suggestionText: "New Note: note", target: { kind: "action" as const, id: "test-action", callback: jest.fn() },
                icon: "plus-circle",
                match: { score: -10, matches: [[0, 4]] },
            },
        ];

        mockEntityProvider.getEntityList.mockReturnValue(entitySuggestions);
        mockEntityProvider.getTemplateCreationSuggestions.mockReturnValue(templateSuggestions);

        const result = suggestor.getSuggestions(context);

        expect(result).toContainEqual({
            suggestionText: "Note suggestion", target: { kind: "unresolved-link" as const, linkpath: "Note suggestion" },
            match: { score: 10, matches: [[0, 4]] },
        });
        expect(result).toContainEqual({
            suggestionText: "New Note: note", target: { kind: "action" as const, id: "test-action", callback: expect.any(Function) },
            icon: "plus-circle",
            match: { score: -10, matches: [[0, 4]] },
        });
        expect(mockEntityProvider.getEntityList).toHaveBeenCalledWith("note", TriggerCharacter.At);
        expect(mockEntityProvider.getTemplateCreationSuggestions).toHaveBeenCalledWith("note");
    });
});

jest.mock("../src/userComponents", () => ({ EntitiesNotice: jest.fn() }));
