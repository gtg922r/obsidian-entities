import { App, TFile } from "obsidian";
import { compileFilters, applyFiltersToFiles } from "../../src/Providers/EntityFilters";
import { EntityFilter } from "../../src/entities.types";

jest.mock("obsidian", () => {
	class MockTFile {
		path: string;
		basename: string;
		extension = "md";
		stat = { ctime: 0, mtime: 0, size: 0 };
		constructor(path: string, basename: string) {
			this.path = path;
			this.basename = basename;
		}
	}

	return {
		TFile: MockTFile,
	};
});

const createMockFile = (path: string, basename: string): TFile => {
	return new (TFile as any)(path, basename);
};

const createMockApp = (
	metadataCache: Record<string, { frontmatter?: Record<string, unknown> }>
): App => {
	return {
		metadataCache: {
			getFileCache: jest.fn((file: { path: string }) => metadataCache[file.path] || null),
		},
		vault: {
			getAbstractFileByPath: jest.fn((path: string) => {
				// Return a mock TFile for any path that exists in metadata
				if (metadataCache[path]) {
					return createMockFile(path, path.split("/").pop()?.replace(".md", "") || "");
				}
				return null;
			}),
		},
	} as unknown as App;
};

describe("compileFilters", () => {
	test("compiles valid regex filters", () => {
		const filters: EntityFilter[] = [
			{ type: "include", property: "type", value: "person" },
			{ type: "exclude", property: "status", value: "^archived$" },
		];
		const compiled = compileFilters(filters);
		expect(compiled).toHaveLength(2);
		expect(compiled[0].regex).toBeInstanceOf(RegExp);
		expect(compiled[1].regex.test("archived")).toBe(true);
	});

	test("discards invalid regex filters", () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation();
		const filters: EntityFilter[] = [
			{ type: "include", property: "type", value: "[invalid" },
			{ type: "include", property: "status", value: "valid" },
		];
		const compiled = compileFilters(filters);
		expect(compiled).toHaveLength(1);
		expect(compiled[0].property).toBe("status");
		consoleSpy.mockRestore();
	});

	test("returns empty array for empty input", () => {
		expect(compileFilters([])).toEqual([]);
	});
});

describe("applyFiltersToFiles", () => {
	test("returns all files when no filters", () => {
		const files = [createMockFile("a.md", "a"), createMockFile("b.md", "b")];
		const app = createMockApp({});
		expect(applyFiltersToFiles(files, undefined, app)).toEqual(files);
		expect(applyFiltersToFiles(files, [], app)).toEqual(files);
	});

	test("include filter keeps matching files", () => {
		const files = [
			createMockFile("People/Alice.md", "Alice"),
			createMockFile("People/Bob.md", "Bob"),
		];
		const app = createMockApp({
			"People/Alice.md": { frontmatter: { type: "person" } },
			"People/Bob.md": { frontmatter: { type: "robot" } },
		});
		const result = applyFiltersToFiles(
			files,
			[{ type: "include", property: "type", value: "person" }],
			app
		);
		expect(result).toHaveLength(1);
		expect(result[0].basename).toBe("Alice");
	});

	test("exclude filter removes matching files", () => {
		const files = [
			createMockFile("People/Alice.md", "Alice"),
			createMockFile("People/Bob.md", "Bob"),
		];
		const app = createMockApp({
			"People/Alice.md": { frontmatter: { type: "person" } },
			"People/Bob.md": { frontmatter: { type: "robot" } },
		});
		const result = applyFiltersToFiles(
			files,
			[{ type: "exclude", property: "type", value: "robot" }],
			app
		);
		expect(result).toHaveLength(1);
		expect(result[0].basename).toBe("Alice");
	});

	test("multiple filters are ANDed", () => {
		const files = [
			createMockFile("a.md", "a"),
			createMockFile("b.md", "b"),
			createMockFile("c.md", "c"),
		];
		const app = createMockApp({
			"a.md": { frontmatter: { type: "person", status: "active" } },
			"b.md": { frontmatter: { type: "person", status: "inactive" } },
			"c.md": { frontmatter: { type: "robot", status: "active" } },
		});
		const result = applyFiltersToFiles(
			files,
			[
				{ type: "include", property: "type", value: "person" },
				{ type: "include", property: "status", value: "^active$" },
			],
			app
		);
		expect(result).toHaveLength(1);
		expect(result[0].basename).toBe("a");
	});

	test("files without frontmatter are excluded by include filters", () => {
		const files = [createMockFile("a.md", "a")];
		const app = createMockApp({ "a.md": {} });
		const result = applyFiltersToFiles(
			files,
			[{ type: "include", property: "type", value: "person" }],
			app
		);
		expect(result).toHaveLength(0);
	});

	test("exclude filter keeps files without the property", () => {
		const files = [
			createMockFile("a.md", "a"),
			createMockFile("b.md", "b"),
		];
		const app = createMockApp({
			"a.md": { frontmatter: { archived: "true" } },
			"b.md": { frontmatter: {} },
		});
		const result = applyFiltersToFiles(
			files,
			[{ type: "exclude", property: "archived", value: "true" }],
			app
		);
		expect(result).toHaveLength(1);
		expect(result[0].basename).toBe("b");
	});

	test("case-insensitive regex matching", () => {
		const files = [createMockFile("a.md", "a")];
		const app = createMockApp({
			"a.md": { frontmatter: { type: "Person" } },
		});
		const result = applyFiltersToFiles(
			files,
			[{ type: "include", property: "type", value: "person" }],
			app
		);
		expect(result).toHaveLength(1);
	});
});
