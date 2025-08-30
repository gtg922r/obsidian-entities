import { App, Editor, EditorSuggestContext, TFile } from "obsidian";
import Entities from "../src/main";
import { EntitiesSuggestor, EntitySuggestionItem } from "../src/EntitiesSuggestor";
import { EntityProvider, EntityProviderUserSettings, RefreshBehavior } from "../src/Providers/EntityProvider";
import ProviderRegistry from "../src/Providers/ProviderRegistry";
import { TriggerCharacter } from "../src/entities.types";

// Mocking the necessary Obsidian interfaces and classes inline
jest.mock("obsidian", () => {
    return {
        EditorSuggest: class { close() {} },
        Plugin: class {
            app: jest.MockedObject<App>;
            constructor(app: App) {
                this.app = app;
            }
        },
        prepareQuery: jest.fn().mockImplementation((query) => query), // Mock prepareQuery to return the query itself
        fuzzySearch: jest.fn().mockImplementation((query, text) => {
            // Mock implementation of fuzzySearch
            if (text.toLowerCase().includes(query.toLowerCase())) {
                return { score: 10, matches: [[0, query.length]] };
            }
            return null;
        }),
    };
});

// Creating a mock for the Entities plugin
const mockPlugin = {
	app: {}, // Mock the app object as needed
} as unknown as Entities;

describe("onTrigger tests", () => {
	let suggestor: EntitiesSuggestor;
	let mockEditor: jest.Mocked<Editor>;
	let mockFile: jest.Mocked<TFile>;
	let registry: jest.Mocked<ProviderRegistry>;

	beforeEach(() => {
		registry = {
			getProviders: jest.fn(),
			getProvidersForTrigger: jest.fn(),
		} as unknown as jest.Mocked<ProviderRegistry>;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		suggestor = new EntitiesSuggestor(mockPlugin, registry);

		// Mocking the editor instance
		mockEditor = {
			getLine: jest.fn(),
		} as unknown as jest.Mocked<Editor>;

		// Mocking the TFile instance
		mockFile = {} as unknown as TFile;
	});

	test("onTrigger should prioritize @ over / in '@8/17'", () => {
		mockEditor.getLine.mockImplementationOnce(() => "@8/17");
		const cursorPosition = { line: 0, ch: 5 };
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).toEqual({
			start: { line: 0, ch: 1 },
			end: cursorPosition,
			query: "@8/17",
		});
	});

	test("onTrigger should include spaces after @ for multi-word queries", () => {
		mockEditor.getLine.mockImplementationOnce(() => "@bob ho");
		const cursorPosition = { line: 0, ch: 7 };
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).toEqual({
			start: { line: 0, ch: 1 },
			end: cursorPosition,
			query: "@bob ho",
		});
	});

	test("onTrigger should prefer earlier @ over / at token start on same line", () => {
		mockEditor.getLine.mockImplementationOnce(() => "@note /open");
		const cursorPosition = { line: 0, ch: 11 };
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).toEqual({
			start: { line: 0, ch: 1 },
			end: cursorPosition,
			query: "@note /open",
		});
	});

	test("onTrigger should return null when @ is not present", () => {
		mockEditor.getLine?.mockImplementationOnce(
			() => "no special character"
		);
		const cursorPosition = { line: 0, ch: 10 };
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).toBeNull();
	});

	test("onTrigger should return word after @ character when cursor is at end of line", () => {
		mockEditor.getLine.mockImplementationOnce(() => "some text @keyword");
		const cursorPosition = { line: 0, ch: 18 }; // Assuming cursor is at the end of "some text @keyword"
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 11 },
			end: cursorPosition,
			query: "@keyword",
		});
	});

	test("onTrigger should return word after @ character when cursor is at beginning of line", () => {
		mockEditor.getLine.mockImplementationOnce(() => "@keyword");
		const cursorPosition = { line: 0, ch: 8 }; // Assuming cursor is at the end of "@keyword"
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 1 },
			end: cursorPosition,
			query: "@keyword",
		});
	});

	test("onTrigger should return word after @ character when cursor is in middle of the line", () => {
		mockEditor.getLine.mockImplementationOnce(
			() => "some text @keyword and some more text"
		);
		const cursorPosition = { line: 0, ch: 18 }; // Assuming cursor is right after "some text @keyword"
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 11 },
			end: cursorPosition,
			query: "@keyword",
		});
	});

	test("onTrigger should return words after @ character when cursor is placed after muliple words separated by spaces", () => {
		mockEditor.getLine.mockImplementationOnce(
			() => "some text @keyword and some more text"
		);
		const cursorPosition = { line: 0, ch: 37 }; // Assuming cursor is right after "some text @keyword "
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 11 },
			end: cursorPosition,
			query: "@keyword and some more text",
		});
	});

	test("onTrigger should return null when cursor is before @ symbol", () => {
		mockEditor.getLine.mockImplementationOnce(() => "some text @keyword");
		const cursorPosition = { line: 0, ch: 9 }; // Assuming cursor is before "@keyword"
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).toBeNull();
	});

	test("onTrigger should return null when cursor is at the beginning of the line", () => {
		mockEditor.getLine.mockImplementationOnce(() => "");
		const cursorPosition = { line: 0, ch: 0 };
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor,
			mockFile
		);

		expect(result).toBeNull();
	});

        test("onTrigger should return null when @ is followed by spaces", () => {
                mockEditor.getLine.mockImplementationOnce(() => "@   ");
                const cursorPosition = { line: 0, ch: 4 };
                const result = suggestor.onTrigger(
                        cursorPosition,
                        mockEditor,
                        mockFile
                );

                expect(result).toBeNull();
        });

        test("onTrigger should handle a lone @ at the start of a line", () => {
                mockEditor.getLine.mockImplementationOnce(() => "@");
                const cursorPosition = { line: 0, ch: 1 };
                const result = suggestor.onTrigger(
                        cursorPosition,
                        mockEditor as Editor,
                        mockFile
                );

                expect(result).toEqual({
                        start: { line: 0, ch: 1 },
                        end: cursorPosition,
                        query: "@",
                });
        });

	test("onTrigger should return correct trigger info when @ is at the beginning of the line followed by text", () => {
		mockEditor.getLine.mockImplementationOnce(() => "@example");
		const cursorPosition = { line: 0, ch: 8 };
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 1 },
			end: { line: 0, ch: 8 },
			query: "@example",
		});
	});

	test("onTrigger should return null when there is text but no @ character", () => {
		mockEditor.getLine.mockImplementationOnce(
			() => "example text without special character"
		);
		const cursorPosition = { line: 0, ch: 20 };
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor,
			mockFile
		);

		expect(result).toBeNull();
	});

	test("onTrigger should handle multiple @ characters correctly and when cursor is mid-word", () => {
		mockEditor.getLine.mockImplementationOnce(() => "text @first @second");
		const cursorPosition = { line: 0, ch: 18 }; // Assuming cursor is one character before end of line
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 13 },
			end: { line: 0, ch: 18 },
			query: "@secon",
		});
	});

	test("onTrigger should return word after : character when cursor is at end of line", () => {
		mockEditor.getLine.mockImplementationOnce(() => "some text :keyword");
		const cursorPosition = { line: 0, ch: 18 }; // Assuming cursor is at the end of "some text :keyword"
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 11 },
			end: cursorPosition,
			query: ":keyword",
		});
	});

	test("onTrigger should return word after / character when cursor is at end of line", () => {
		mockEditor.getLine.mockImplementationOnce(() => "some text /keyword");
		const cursorPosition = { line: 0, ch: 18 }; // Assuming cursor is at the end of "some text /keyword"
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 11 },
			end: cursorPosition,
			query: "/keyword",
		});
	});

	test("onTrigger should return word after : character when cursor is in middle of the line", () => {
		mockEditor.getLine.mockImplementationOnce(
			() => "some text :keyword and some more text"
		);
		const cursorPosition = { line: 0, ch: 18 }; // Assuming cursor is right after "some text :keyword"
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 11 },
			end: cursorPosition,
			query: ":keyword",
		});
	});

	test("onTrigger should return word after / character when cursor is in middle of the line", () => {
		mockEditor.getLine.mockImplementationOnce(
			() => "some text /keyword and some more text"
		);
		const cursorPosition = { line: 0, ch: 18 }; // Assuming cursor is right after "some text /keyword"
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 11 },
			end: cursorPosition,
			query: "/keyword",
		});
	});

	test("onTrigger should return null when : is not present", () => {
		mockEditor.getLine.mockImplementationOnce(
			() => "no special character"
		);
		const cursorPosition = { line: 0, ch: 10 };
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).toBeNull();
	});

	test("onTrigger should return null when / is not present", () => {
		mockEditor.getLine.mockImplementationOnce(
			() => "no special character"
		);
		const cursorPosition = { line: 0, ch: 10 };
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).toBeNull();
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
                suggestionText: "Test suggestion",
            },
        ];

		const expectedSuggestionsWithMatches: EntitySuggestionItem[] = [
			{
				suggestionText: "Test suggestion",
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
                suggestionText: "Note suggestion",
                match: { score: 5, matches: [] },
            },
        ];

        const templateSuggestions: EntitySuggestionItem[] = [
            {
                suggestionText: "New Note: note",
                icon: "plus-circle",
                action: jest.fn(),
                match: { score: -10, matches: [[0, 4]] },
            },
        ];

        mockEntityProvider.getEntityList.mockReturnValue(entitySuggestions);
        mockEntityProvider.getTemplateCreationSuggestions.mockReturnValue(templateSuggestions);

        const result = suggestor.getSuggestions(context);

        expect(result).toContainEqual({
            suggestionText: "Note suggestion",
            match: { score: 10, matches: [[0, 4]] },
        });
        expect(result).toContainEqual({
            suggestionText: "New Note: note",
            icon: "plus-circle",
            action: expect.any(Function),
            match: { score: -10, matches: [[0, 4]] },
        });
        expect(mockEntityProvider.getEntityList).toHaveBeenCalledWith("note", TriggerCharacter.At);
        expect(mockEntityProvider.getTemplateCreationSuggestions).toHaveBeenCalledWith("note");
    });
});
describe("replaceTextAtContext tests", () => {
    test("cursor position accounts for multi-line insertions", () => {
        const registry = {} as unknown as jest.Mocked<ProviderRegistry>;
        const suggestor = new EntitiesSuggestor(mockPlugin, registry);
        const mockEditor = {
            replaceRange: jest.fn(),
            setCursor: jest.fn(),
            posToOffset: jest.fn().mockReturnValue(0),
            offsetToPos: jest.fn().mockReturnValue({ line: 1, ch: 4 }),
        } as unknown as jest.Mocked<Editor>;
        const context = {
            editor: mockEditor,
            start: { line: 0, ch: 1 },
            end: { line: 0, ch: 1 },
            query: "@",
        } as unknown as EditorSuggestContext;

        (suggestor as any).replaceTextAtContext("a\nbc", context);

        expect(mockEditor.posToOffset).toHaveBeenCalledWith({ line: 0, ch: 0 });
        expect(mockEditor.replaceRange).toHaveBeenCalledWith(
            "a\nbc",
            { line: 0, ch: 0 },
            { line: 0, ch: 1 }
        );
        expect(mockEditor.offsetToPos).toHaveBeenCalledWith(4);
        expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 1, ch: 4 });
    });
});
