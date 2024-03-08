import { App, Editor, EditorSuggestContext, TFile } from "obsidian";
import Entities from "../src/main";
import { EntitiesSuggestor, EntitySuggestionItem } from "../src/EntitiesSuggestor";

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
	};
});

// Creating a mock for the Entities plugin
const mockPlugin = {
	app: {}, // Mock the app object as needed
} as unknown as Entities;

describe("EntitiesSuggestor", () => {
	let suggestor: EntitiesSuggestor;
	let mockEditor: jest.Mocked<Editor>;
	let mockFile: jest.Mocked<TFile>;

	beforeEach(() => {
		suggestor = new EntitiesSuggestor(mockPlugin);

		// Mocking the editor instance
		mockEditor = {
			getLine: jest.fn().mockImplementation((line: number) => {
				if (line === 0) {
					return "@test";
				}
				return "";
			}),
		} as unknown as jest.Mocked<Editor>;

		// Mocking the TFile instance with minimal properties
		mockFile = {
			path: "test.md", // Example property, add more as needed based on your usage
			// Add other properties required by your implementation or tests
		} as unknown as TFile;
	});

	test("onTrigger should return correct trigger info when @ is present", () => {
		const cursorPosition = { line: 0, ch: 5 }; // Assuming cursor is at the end of "@test"
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 1 },
			end: cursorPosition,
			query: "test",
		});
	});

	test("onTrigger should return null when @ is not present", () => {
		mockEditor.getLine?.mockImplementationOnce(() => "no special character");
		const cursorPosition = { line: 0, ch: 10 };
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).toBeNull();
	});

	test("onTrigger should return correct trigger info when @ is contained within a line", () => {
		mockEditor.getLine.mockImplementationOnce(() => "text text @file");
		const cursorPosition = { line: 0, ch: 15 }; // Assuming cursor is at the end of "text text @file"
		const result = suggestor.onTrigger(
			cursorPosition,
			mockEditor as Editor,
			mockFile
		);

		expect(result).not.toBeNull();
		expect(result).toEqual({
			start: { line: 0, ch: 11 },
			end: cursorPosition,
			query: "file",
		});
	});
});

describe("getSuggestions", () => {
	let suggestor: EntitiesSuggestor;
	let mockEditor: jest.Mocked<Editor>;
	let mockFile: jest.Mocked<TFile>;

	beforeEach(() => {
		jest.useFakeTimers();
		suggestor = new EntitiesSuggestor(mockPlugin);
		// Update mock return values to return EntitySuggestionItem[]
		jest.spyOn(suggestor, 'getEntityList').mockReturnValue([
			{ suggestionText: 'Alice', icon: 'p', noteText: 'Note about Alice' },
			{ suggestionText: 'Bob', icon: 'p', noteText: 'Note about Bob' },
			{ suggestionText: 'Charlie', icon: 'p', noteText: 'Note about Charlie' }
		]);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test("getSuggestions should return filtered suggestions based on the query", async () => {
		const context = { query: "Al", editor: mockEditor, file: mockFile };
		const suggestions = await suggestor.getSuggestions(context as unknown as EditorSuggestContext);
		// Expectations updated to match against EntitySuggestionItem objects
		expect(suggestions).toEqual([
			{ suggestionText: 'Alice', icon: 'p', noteText: 'Note about Alice' }
		]);
	});

	test("getSuggestions should use the local cache if called again within 200ms", async () => {
		const context1 = { query: "Al", editor: mockEditor, file: mockFile };
		const context2 = { query: "Bo", editor: mockEditor, file: mockFile };

		// First call to getSuggestions
		const suggestions1 = await suggestor.getSuggestions(context1 as unknown as EditorSuggestContext);
		expect(suggestions1).toEqual([
			{ suggestionText: 'Alice', icon: 'p', noteText: 'Note about Alice' }
		]);
		expect(suggestor.getEntityList).toHaveBeenCalledTimes(1);

		// Advance time by less than 200ms
		jest.advanceTimersByTime(100);

		// Second call to getSuggestions
		const suggestions2 = await suggestor.getSuggestions(context2 as unknown as EditorSuggestContext);
		expect(suggestor.getEntityList).toHaveBeenCalledTimes(1);
		expect(suggestions2).toEqual([
			{ suggestionText: 'Bob', icon: 'p', noteText: 'Note about Bob' }
		]);
	});

	test("getSuggestions should update the local cache if called again after 200ms", async () => {
		const context1 = { query: "Al", editor: mockEditor, file: mockFile };
		const context2 = { query: "Ali", editor: mockEditor, file: mockFile };

		// First call to getSuggestions
		jest.spyOn(suggestor, 'getEntityList').mockReturnValue([
			{ suggestionText: 'Alice', icon: 'p', noteText: 'Note about Alice' },
			{ suggestionText: 'Bob', icon: 'p', noteText: 'Note about Bob' },
			{ suggestionText: 'Charlie', icon: 'p', noteText: 'Note about Charlie' }
		]);
		const suggestions1 = await suggestor.getSuggestions(context1 as unknown as EditorSuggestContext);
		expect(suggestions1).toEqual([
			{ suggestionText: 'Alice', icon: 'p', noteText: 'Note about Alice' }
		]);
		expect(suggestor.getEntityList).toHaveBeenCalledTimes(1);

		// Advance time by more than 200ms
		jest.advanceTimersByTime(300);

		// Second call to getSuggestions
		jest.spyOn(suggestor, 'getEntityList').mockReturnValue([
			{ suggestionText: 'Alive', icon: 'p', noteText: 'Note about Alive' },
			{ suggestionText: 'Bobbi', icon: 'p', noteText: 'Note about Bobbi' },
			{ suggestionText: 'Charles', icon: 'p', noteText: 'Note about Charles' }
		]);
		const suggestions2 = await suggestor.getSuggestions(context2 as unknown as EditorSuggestContext);
		expect(suggestor.getEntityList).toHaveBeenCalledTimes(2);
		expect(suggestions2).toEqual([
			{ suggestionText: 'Alive', icon: 'p', noteText: 'Note about Alive' }
		]);
	});

	test("getSuggestions should return an empty array if no suggestions match the query", async () => {
		const context = { query: "Z", editor: mockEditor, file: mockFile };
		const suggestions = await suggestor.getSuggestions(context as unknown as EditorSuggestContext);
		expect(suggestions).toEqual([]);
	});
});
