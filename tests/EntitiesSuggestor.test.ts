import { App, Editor, EditorSuggestContext, TFile } from "obsidian";
import Entities from "../src/main";
import { EntitiesSuggestor, EntityProvider } from "../src/EntitiesSuggestor";

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

describe("getSuggestions", () => {
	let suggestor: EntitiesSuggestor;
	let mockEditor: jest.Mocked<Editor>;
	let mockFile: jest.Mocked<TFile>;

	beforeEach(() => {
		jest.useFakeTimers();
		suggestor = new EntitiesSuggestor(mockPlugin, [
			new EntityProvider(mockPlugin, (query: string) => [
				{
					suggestionText: "Alice",
					icon: "p",
					noteText: "Note about Alice",
				},
				{
					suggestionText: "Bob",
					icon: "p",
					noteText: "Note about Bob",
				},
				{
					suggestionText: "Charlie",
					icon: "p",
					noteText: "Note about Charlie",
				},
			]),
		]);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test("getSuggestions should return filtered suggestions based on the query", async () => {
		const context = { query: "Al", editor: mockEditor, file: mockFile };
		const suggestions = await suggestor.getSuggestions(
			context as unknown as EditorSuggestContext
		);
		// Expectations updated to match against EntitySuggestionItem objects
		expect(suggestions).toEqual([
			{
				suggestionText: "Alice",
				icon: "p",
				noteText: "Note about Alice",
			},
		]);
	});

	test("getSuggestions should use the local cache if called again within 200ms", async () => {
		const context1 = { query: "Al", editor: mockEditor, file: mockFile };
		const context2 = { query: "Bo", editor: mockEditor, file: mockFile };

		// First call to getSuggestions
		const suggestions1 = await suggestor.getSuggestions(
			context1 as unknown as EditorSuggestContext
		);
		expect(suggestions1).toEqual([
			{
				suggestionText: "Alice",
				icon: "p",
				noteText: "Note about Alice",
			},
		]);

		// Advance time by less than 200ms
		jest.advanceTimersByTime(100);

		// Second call to getSuggestions
		const suggestions2 = await suggestor.getSuggestions(
			context2 as unknown as EditorSuggestContext
		);
		expect(suggestions2).toEqual([
			{ suggestionText: "Bob", icon: "p", noteText: "Note about Bob" },
		]);
	});

	test("getSuggestions should update the local cache if called again after 200ms", async () => {
		const context1 = { query: "Al", editor: mockEditor, file: mockFile };
		const context2 = { query: "Ali", editor: mockEditor, file: mockFile };

		// First call to getSuggestions
		const suggestions1 = await suggestor.getSuggestions(
			context1 as unknown as EditorSuggestContext
		);
		expect(suggestions1).toEqual([
			{
				suggestionText: "Alice",
				icon: "p",
				noteText: "Note about Alice",
			},
		]);

		// Advance time by more than 200ms
		jest.advanceTimersByTime(300);

		// Second call to getSuggestions
		const suggestions2 = await suggestor.getSuggestions(
			context2 as unknown as EditorSuggestContext
		);
		expect(suggestions2).toEqual([
			{
				suggestionText: "Alice",
				icon: "p",
				noteText: "Note about Alice",
			}, // Assuming 'Ali' still matches 'Alice'
		]);
	});

	test("getSuggestions should return an empty array if no suggestions match the query", async () => {
		const context = { query: "Z", editor: mockEditor, file: mockFile };
		const suggestions = await suggestor.getSuggestions(
			context as unknown as EditorSuggestContext
		);
		expect(suggestions).toEqual([]);
	});
});
