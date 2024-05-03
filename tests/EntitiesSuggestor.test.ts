import { App, Editor, EditorSuggestContext, TFile } from "obsidian";
import Entities from "../src/main";
import { EntitiesSuggestor, EntityProvider, EntitySuggestionItem } from "../src/EntitiesSuggestor";

// Mocking the necessary Obsidian interfaces and classes inline
jest.mock("obsidian", () => {
    return {
        EditorSuggest: class {},
        Plugin: class {
            app: jest.MockedObject<App>;
            constructor(app: App) {
                this.app = app;
            }
        },
        prepareQuery: jest.fn().mockImplementation((query) => query), // Mock prepareQuery to return the query itself
        fuzzySearch: jest.fn().mockImplementation((query, text) => {
            // Simple mock implementation of fuzzySearch
            return query === text ? { score: 100, matches: [0, query.length] } : null;
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

	beforeEach(() => {
		suggestor = new EntitiesSuggestor(mockPlugin);

		// Mocking the editor instance
		mockEditor = {
			getLine: jest.fn(),
		} as unknown as jest.Mocked<Editor>;

		// Mocking the TFile instance
		mockFile = {} as unknown as TFile;
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
			query: "keyword",
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
			query: "keyword",
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
			query: "keyword",
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
			query: "keyword and some more text",
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

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 1 },
			end: { line: 0, ch: 4 },
			query: "   ",
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
			query: "example",
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

	test("onTrigger should handle multiple @ characters correctly", () => {
		mockEditor.getLine.mockImplementationOnce(() => "text @first @second");
		const cursorPosition = { line: 0, ch: 18 }; // Assuming cursor is one character before end of line
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 6 },
			end: { line: 0, ch: 18 },
			query: "first @secon",
		});
	});
});

describe("getSuggestions tests", () => {
    let suggestor: EntitiesSuggestor;
    let mockEditor: jest.Mocked<Editor>;
    let mockFile: jest.Mocked<TFile>;
    let mockEntityProvider: jest.Mocked<EntityProvider>;

    beforeEach(() => {
        suggestor = new EntitiesSuggestor(mockPlugin);

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
        } as unknown as jest.Mocked<EntityProvider>;

        suggestor.addEntityProvider(mockEntityProvider);
    });

    test("getSuggestions should return a list of suggestions based on the query", () => {
        const context = {
            query: "test",
            editor: mockEditor,
            file: mockFile,
        } as unknown as EditorSuggestContext;

        const expectedSuggestions: EntitySuggestionItem[] = [
            {
                suggestionText: "Test suggestion",
                match: { score: 10, matches: [] },
            },
        ];

        mockEntityProvider.getEntityList.mockReturnValue(expectedSuggestions);
        mockEntityProvider.getTemplateCreationSuggestions.mockReturnValue([]);

        const result = suggestor.getSuggestions(context);

        expect(result).toEqual(expectedSuggestions);
        expect(mockEntityProvider.getEntityList).toHaveBeenCalledWith("test");
    });

    test("getSuggestions should include template creation suggestions", () => {
        const context = {
            query: "note",
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
                match: { score: -10, matches: [] },
            },
        ];

        mockEntityProvider.getEntityList.mockReturnValue(entitySuggestions);
        mockEntityProvider.getTemplateCreationSuggestions.mockReturnValue(templateSuggestions);

        const result = suggestor.getSuggestions(context);

        expect(result).toContainEqual({
            suggestionText: "Note suggestion",
            match: { score: 5, matches: [] },
        });
        expect(result).toContainEqual({
            suggestionText: "New Note: note",
            icon: "plus-circle",
            action: expect.any(Function),
            match: { score: -10, matches: [] },
        });
        expect(mockEntityProvider.getEntityList).toHaveBeenCalledWith("note");
        expect(mockEntityProvider.getTemplateCreationSuggestions).toHaveBeenCalledWith("note");
    });
});
