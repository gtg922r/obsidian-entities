import { Plugin } from "obsidian";
import { FolderEntityProvider } from "../../src/Providers/FolderEntityProvider";
import { TriggerCharacter } from "../../src/entities.types";

// Mock TFile class defined inside jest.mock to avoid hoisting issues
jest.mock("obsidian", () => {
	// Define MockTFile inside the factory
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
			addButton() { return this; }
			addExtraButton() { return this; }
			addText() { return this; }
			addDropdown() { return this; }
			setHeading() { return this; }
		},
		ExtraButtonComponent: class {},
		sanitizeHTMLToDom: (html: string) => html,
		TFile: MockTFile,
	};
});

jest.mock("../../src/ui/file-suggest", () => ({
	FolderSuggest: jest.fn(),
}));

jest.mock("../../src/userComponents", () => ({
	IconPickerModal: jest.fn(),
	openTemplateDetailsModal: jest.fn(),
}));

jest.mock("../../src/ui/FrontmatterKeySuggest", () => ({
	FrontmatterKeySuggest: jest.fn(),
}));

// Get TFile from the mocked obsidian module for creating test instances
import { TFile } from "obsidian";

interface MockMetadata {
	frontmatter?: {
		aliases?: string | string[];
		[key: string]: unknown;
	};
}

const createMockPlugin = (
	folderContents: { [path: string]: InstanceType<typeof TFile>[] },
	metadataCache: { [path: string]: MockMetadata } = {}
) => {
	return {
		app: {
			vault: {
				getFolderByPath: jest.fn((path: string) => {
					const files = folderContents[path];
					if (!files) return null;
					return {
						path,
						children: files,
					};
				}),
			},
			metadataCache: {
				getFileCache: jest.fn((file: { path: string }) => metadataCache[file.path] || null),
			},
		},
	} as unknown as Plugin;
};

const createMockFile = (path: string, basename: string): InstanceType<typeof TFile> => {
	return new (TFile as any)(path, basename);
};

describe("FolderEntityProvider", () => {
	describe("static properties", () => {
		test("has correct providerTypeID", () => {
			expect(FolderEntityProvider.providerTypeID).toBe("folder");
		});

		test("getDescription without settings", () => {
			const desc = FolderEntityProvider.getDescription();
			expect(desc).toBe("Folder Entity Provider");
		});

		test("getDescription with settings shows path", () => {
			const settings = {
				...FolderEntityProvider.getDefaultSettings(),
				path: "People",
			};
			const desc = FolderEntityProvider.getDescription(settings);
			expect(desc).toBe("📂 Folder Entity Provider (People)");
		});

		test("getDefaultSettings returns valid defaults", () => {
			const defaults = FolderEntityProvider.getDefaultSettings();
			expect(defaults.providerTypeID).toBe("folder");
			expect(defaults.enabled).toBe(true);
			expect(defaults.icon).toBe("folder-open-dot");
			expect(defaults.path).toBe("");
			expect(defaults.shouldLoadSubFolders).toBe(false);
			expect(defaults.shouldCreateEntitiesForAliases).toBe(true);
		});
	});

	describe("instance behavior", () => {
		test("default triggers is At", () => {
			const mockPlugin = createMockPlugin({});
			const provider = new FolderEntityProvider(mockPlugin, {});
			expect(provider.triggers).toEqual([TriggerCharacter.At]);
		});

		test("getDescription instance method", () => {
			const mockPlugin = createMockPlugin({});
			const provider = new FolderEntityProvider(mockPlugin, {
				path: "Projects",
			});
			expect(provider.getDescription()).toBe("📂 Folder Entity Provider (Projects)");
		});
	});

	describe("getEntityList", () => {
		test("returns empty for non-existent folder", () => {
			const mockPlugin = createMockPlugin({});
			const provider = new FolderEntityProvider(mockPlugin, {
				path: "NonExistent",
			});
			const results = provider.getEntityList("test");
			expect(results).toEqual([]);
		});

		test("returns files from folder", () => {
			const files = [
				createMockFile("People/Alice.md", "Alice"),
				createMockFile("People/Bob.md", "Bob"),
				createMockFile("People/Charlie.md", "Charlie"),
			];
			const mockPlugin = createMockPlugin({ "People": files });
			const provider = new FolderEntityProvider(mockPlugin, {
				path: "People",
			});
			const results = provider.getEntityList("test");
			// Should have 3 base suggestions (no aliases configured)
			expect(results).toHaveLength(3);
			expect(results.map(r => r.suggestionText)).toEqual(["Alice", "Bob", "Charlie"]);
		});

		test("uses configured icon", () => {
			const files = [createMockFile("People/Alice.md", "Alice")];
			const mockPlugin = createMockPlugin({ "People": files });
			const provider = new FolderEntityProvider(mockPlugin, {
				path: "People",
				icon: "user",
			});
			const results = provider.getEntityList("test");
			expect(results[0].icon).toBe("user");
		});

		test("uses default icon when not specified", () => {
			const files = [createMockFile("People/Alice.md", "Alice")];
			const mockPlugin = createMockPlugin({ "People": files });
			const provider = new FolderEntityProvider(mockPlugin, {
				path: "People",
			});
			const results = provider.getEntityList("test");
			expect(results[0].icon).toBe("folder-open-dot");
		});

		describe("alias handling", () => {
			test("includes single alias as string", () => {
				const files = [createMockFile("People/Alice.md", "Alice")];
				const metadata = {
					"People/Alice.md": {
						frontmatter: { aliases: "Ali" },
					},
				};
				const mockPlugin = createMockPlugin({ "People": files }, metadata);
				const provider = new FolderEntityProvider(mockPlugin, {
					path: "People",
				});
				const results = provider.getEntityList("test");
				// Should have base + alias
				expect(results).toHaveLength(2);
				expect(results.map(r => r.suggestionText)).toContain("Alice");
				expect(results.map(r => r.suggestionText)).toContain("Ali");
			});

			test("includes multiple aliases as array", () => {
				const files = [createMockFile("People/Alice.md", "Alice")];
				const metadata = {
					"People/Alice.md": {
						frontmatter: { aliases: ["Ali", "A", "Alice Smith"] },
					},
				};
				const mockPlugin = createMockPlugin({ "People": files }, metadata);
				const provider = new FolderEntityProvider(mockPlugin, {
					path: "People",
				});
				const results = provider.getEntityList("test");
				// Should have base + 3 aliases
				expect(results).toHaveLength(4);
				expect(results.map(r => r.suggestionText)).toEqual([
					"Alice", "Ali", "A", "Alice Smith"
				]);
			});

			test("alias suggestions have correct replacementText", () => {
				const files = [createMockFile("People/Alice.md", "Alice")];
				const metadata = {
					"People/Alice.md": {
						frontmatter: { aliases: ["Ali"] },
					},
				};
				const mockPlugin = createMockPlugin({ "People": files }, metadata);
				const provider = new FolderEntityProvider(mockPlugin, {
					path: "People",
				});
				const results = provider.getEntityList("test");
				const aliasSuggestion = results.find(r => r.suggestionText === "Ali");
				expect(aliasSuggestion?.replacementText).toBe("Alice|Ali");
			});

			test("base suggestions have no replacementText", () => {
				const files = [createMockFile("People/Alice.md", "Alice")];
				const metadata = {
					"People/Alice.md": {
						frontmatter: { aliases: ["Ali"] },
					},
				};
				const mockPlugin = createMockPlugin({ "People": files }, metadata);
				const provider = new FolderEntityProvider(mockPlugin, {
					path: "People",
				});
				const results = provider.getEntityList("test");
				const baseSuggestion = results.find(r => r.suggestionText === "Alice");
				expect(baseSuggestion?.replacementText).toBeUndefined();
			});
		});

		describe("entity filters", () => {
			test("include filter keeps matching entities", () => {
				const files = [
					createMockFile("People/Alice.md", "Alice"),
					createMockFile("People/Bob.md", "Bob"),
				];
				const metadata = {
					"People/Alice.md": { frontmatter: { type: "person" } },
					"People/Bob.md": { frontmatter: { type: "robot" } },
				};
				const mockPlugin = createMockPlugin({ "People": files }, metadata);
				const provider = new FolderEntityProvider(mockPlugin, {
					path: "People",
					entityFilters: [
						{ type: "include", property: "type", value: "person" },
					],
				});
				const results = provider.getEntityList("test");
				expect(results).toHaveLength(1);
				expect(results[0].suggestionText).toBe("Alice");
			});

			test("exclude filter removes matching entities", () => {
				const files = [
					createMockFile("People/Alice.md", "Alice"),
					createMockFile("People/Bob.md", "Bob"),
				];
				const metadata = {
					"People/Alice.md": { frontmatter: { type: "person" } },
					"People/Bob.md": { frontmatter: { type: "robot" } },
				};
				const mockPlugin = createMockPlugin({ "People": files }, metadata);
				const provider = new FolderEntityProvider(mockPlugin, {
					path: "People",
					entityFilters: [
						{ type: "exclude", property: "type", value: "robot" },
					],
				});
				const results = provider.getEntityList("test");
				expect(results).toHaveLength(1);
				expect(results[0].suggestionText).toBe("Alice");
			});

			test("regex filter works", () => {
				const files = [
					createMockFile("People/Alice.md", "Alice"),
					createMockFile("People/Bob.md", "Bob"),
					createMockFile("People/Charlie.md", "Charlie"),
				];
				const metadata = {
					"People/Alice.md": { frontmatter: { status: "active" } },
					"People/Bob.md": { frontmatter: { status: "inactive" } },
					"People/Charlie.md": { frontmatter: { status: "active-pending" } },
				};
				const mockPlugin = createMockPlugin({ "People": files }, metadata);
				const provider = new FolderEntityProvider(mockPlugin, {
					path: "People",
					entityFilters: [
						{ type: "include", property: "status", value: "^active" },
					],
				});
				const results = provider.getEntityList("test");
				expect(results).toHaveLength(2);
				expect(results.map(r => r.suggestionText)).toEqual(["Alice", "Charlie"]);
			});

			test("invalid regex is ignored", () => {
				const files = [
					createMockFile("People/Alice.md", "Alice"),
				];
				const metadata = {
					"People/Alice.md": { frontmatter: { type: "person" } },
				};
				const mockPlugin = createMockPlugin({ "People": files }, metadata);
				// Suppress console.error for this test
				const consoleSpy = jest.spyOn(console, "error").mockImplementation();
				const provider = new FolderEntityProvider(mockPlugin, {
					path: "People",
					entityFilters: [
						{ type: "include", property: "type", value: "[invalid" },
					],
				});
				const results = provider.getEntityList("test");
				// Invalid filter is skipped, so all pass
				expect(results).toHaveLength(1);
				consoleSpy.mockRestore();
			});

			test("multiple filters are ANDed together", () => {
				const files = [
					createMockFile("People/Alice.md", "Alice"),
					createMockFile("People/Bob.md", "Bob"),
					createMockFile("People/Charlie.md", "Charlie"),
				];
				const metadata: { [path: string]: MockMetadata } = {
					"People/Alice.md": { frontmatter: { type: "person", status: "active" } },
					"People/Bob.md": { frontmatter: { type: "person", status: "inactive" } },
					"People/Charlie.md": { frontmatter: { type: "robot", status: "active" } },
				};
				const mockPlugin = createMockPlugin({ "People": files }, metadata);
				const provider = new FolderEntityProvider(mockPlugin, {
					path: "People",
					entityFilters: [
						{ type: "include", property: "type", value: "person" },
						{ type: "include", property: "status", value: "^active$" }, // exact match
					],
				});
				const results = provider.getEntityList("test");
				// Alice has type=person, status=active (matches both)
				// Bob has type=person, status=inactive (only matches first)
				// Charlie has type=robot, status=active (only matches second)
				expect(results).toHaveLength(1);
				expect(results[0].suggestionText).toBe("Alice");
			});

			test("exclude keeps entities without the property", () => {
				const files = [
					createMockFile("People/Alice.md", "Alice"),
					createMockFile("People/Bob.md", "Bob"),
				];
				const metadata = {
					"People/Alice.md": { frontmatter: { archived: "true" } },
					"People/Bob.md": { frontmatter: {} }, // No archived property
				};
				const mockPlugin = createMockPlugin({ "People": files }, metadata);
				const provider = new FolderEntityProvider(mockPlugin, {
					path: "People",
					entityFilters: [
						{ type: "exclude", property: "archived", value: "true" },
					],
				});
				const results = provider.getEntityList("test");
				expect(results).toHaveLength(1);
				expect(results[0].suggestionText).toBe("Bob");
			});
		});
	});
});
