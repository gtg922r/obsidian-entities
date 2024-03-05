import { App, Editor, TFile } from "obsidian";
import Entities from "../src/main";
import { EntitiesSuggestor } from "../src/EntitiesSuggestor";

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
		jest.setSystemTime(new Date("2023-04-01"));

		// Assuming mockPlugin is defined in a higher scope or imported
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

		// Mocking the TFile instance with minimal properties for use in tests
		mockFile = {
			path: "mock.md", // Mock file path
			// Additional properties can be added here as needed
		} as unknown as TFile;
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test("getSuggestions should return filtered suggestions based on the query", async () => {
		const context = {
			query: "test2",
			editor: mockEditor,
			start: { line: 0, ch: 0 },
			end: { line: 0, ch: 6 },
			file: mockFile, // Include the mock file here
		};

		// Simulate a delay to bypass the 200ms check
		jest.advanceTimersByTime(250);

		const suggestions = await suggestor.getSuggestions(context);
		expect(suggestions).toEqual(["p|test2"]);
	});

	test("getSuggestions should use the local cache if called again within 200ms", async () => {
		const contextFirstCall = {
			query: "test1",
			editor: mockEditor,
			start: { line: 0, ch: 0 },
			end: { line: 0, ch: 6 },
			file: mockFile, // Include the mock file here
		};

		const contextSecondCall = {
			query: "test3",
			editor: mockEditor,
			start: { line: 0, ch: 0 },
			end: { line: 0, ch: 6 },
			file: mockFile, // Include the mock file here
		};

		// First call to populate the cache
		const firstCallSuggestions = await suggestor.getSuggestions(contextFirstCall);
		expect(firstCallSuggestions).toEqual(['p|test1']);

		// Immediately call again to test cache usage
		const secondCallSuggestions = await suggestor.getSuggestions(contextSecondCall);
		expect(secondCallSuggestions).toEqual(['p|test3']);

		// Ensure the cache was indeed used by checking the mock's call count
		expect(mockEditor.getLine).toHaveBeenCalledTimes(0); // Assuming getLine would have been called if not using cache
	});

	test("getSuggestions should return an empty array if no suggestions match the query", async () => {
		const context = {
			query: "nonexistent",
			editor: mockEditor,
			start: { line: 0, ch: 0 },
			end: { line: 0, ch: 12 },
			file: mockFile, // Include the mock file here
		};

		// Simulate a delay to bypass the 200ms check
		jest.advanceTimersByTime(250);

		const suggestions = await suggestor.getSuggestions(context);
		expect(suggestions).toEqual([]);
	});
});
