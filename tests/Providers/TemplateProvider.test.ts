import { Plugin } from "obsidian";
import { TemplateEntityProvider } from "../../src/Providers/TemplateProvider";
import { TriggerCharacter } from "../../src/entities.types";

// Mock TFile and TFolder classes defined inside jest.mock to avoid hoisting issues
jest.mock("obsidian", () => {
	class MockTFile {
		path: string;
		basename: string;
		extension = "md";
		stat = { ctime: 0, mtime: 0, size: 0 };
		constructor(path: string) {
			this.path = path;
			this.basename = path.split("/").pop()?.replace(".md", "") || "";
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
			addDropdown() { return this; }
			addButton() { return this; }
			addExtraButton() { return this; }
			addText() { return this; }
		},
		TFile: MockTFile,
		TFolder: class {
			path: string;
			children: unknown[];
			constructor(path: string, children: unknown[] = []) {
				this.path = path;
				this.children = children;
			}
		},
	};
});

jest.mock("../../src/userComponents", () => ({
	IconPickerModal: jest.fn(),
	EntitiesModalInput: jest.fn().mockImplementation(() => ({
		open: jest.fn(),
		getInput: jest.fn().mockResolvedValue("NewNote"),
	})),
}));

jest.mock("../../src/entitiesUtilities", () => ({
	createNewNoteFromTemplate: jest.fn().mockResolvedValue(undefined),
	insertTemplateUsingTemplater: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/ui/file-suggest", () => ({
	FolderSuggest: jest.fn(),
}));

// Get TFile from mocked obsidian for creating instances
import { TFile } from "obsidian";

const createMockFile = (path: string): InstanceType<typeof TFile> => {
	return new (TFile as any)(path);
};

const createMockPlugin = (folderContents: { [path: string]: InstanceType<typeof TFile>[] }) => {
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
		},
	} as unknown as Plugin;
};

describe("TemplateEntityProvider", () => {
	describe("static properties", () => {
		test("has correct providerTypeID", () => {
			expect(TemplateEntityProvider.providerTypeID).toBe("template");
		});

		test("getDescription without settings", () => {
			const desc = TemplateEntityProvider.getDescription();
			expect(desc).toBe("Template entity provider");
		});

		test("getDescription with settings shows action type and path", () => {
			const settings = {
				...TemplateEntityProvider.getDefaultSettings(),
				path: "Templates",
				actionType: "create" as const,
			};
			const desc = TemplateEntityProvider.getDescription(settings);
			expect(desc).toBe("📄 Template entity provider - create (Templates)");
		});

		test("getDefaultSettings returns valid defaults", () => {
			const defaults = TemplateEntityProvider.getDefaultSettings();
			expect(defaults.providerTypeID).toBe("template");
			expect(defaults.enabled).toBe(true);
			expect(defaults.icon).toBe("file-plus");
			expect(defaults.path).toBe("");
			expect(defaults.actionType).toBe("create");
			expect(defaults.trigger).toBe(TriggerCharacter.Slash);
		});
	});

	describe("instance behavior", () => {
		test("triggers uses configured trigger from settings", () => {
			const mockPlugin = createMockPlugin({});
			const provider = new TemplateEntityProvider(mockPlugin, {
				trigger: TriggerCharacter.At,
			});
			expect(provider.triggers).toEqual([TriggerCharacter.At]);
		});

		test("default trigger is slash", () => {
			const mockPlugin = createMockPlugin({});
			const provider = new TemplateEntityProvider(mockPlugin, {});
			expect(provider.triggers).toEqual([TriggerCharacter.Slash]);
		});

		test("can use colon trigger", () => {
			const mockPlugin = createMockPlugin({});
			const provider = new TemplateEntityProvider(mockPlugin, {
				trigger: TriggerCharacter.Colon,
			});
			expect(provider.triggers).toEqual([TriggerCharacter.Colon]);
		});
	});

	describe("getEntityList", () => {
		test("returns empty for non-existent folder", () => {
			const mockPlugin = createMockPlugin({});
			const provider = new TemplateEntityProvider(mockPlugin, {
				path: "NonExistent",
			});
			const results = provider.getEntityList();
			expect(results).toEqual([]);
		});

		test("returns template files from folder", () => {
			const templateFiles = [
				createMockFile("Templates/Person.md"),
				createMockFile("Templates/Project.md"),
				createMockFile("Templates/Meeting.md"),
			];
			const mockPlugin = createMockPlugin({
				"Templates": templateFiles,
			});
			const provider = new TemplateEntityProvider(mockPlugin, {
				path: "Templates",
			});
			const results = provider.getEntityList();
			expect(results).toHaveLength(3);
			expect(results.map(r => r.suggestionText)).toEqual([
				"Person",
				"Project",
				"Meeting",
			]);
		});

		test("create action type uses file-plus icon", () => {
			const templateFiles = [createMockFile("Templates/Test.md")];
			const mockPlugin = createMockPlugin({ "Templates": templateFiles });
			const provider = new TemplateEntityProvider(mockPlugin, {
				path: "Templates",
				actionType: "create",
			});
			const results = provider.getEntityList();
			expect(results[0].icon).toBe("file-plus");
		});

		test("insert action type uses stamp icon", () => {
			const templateFiles = [createMockFile("Templates/Test.md")];
			const mockPlugin = createMockPlugin({ "Templates": templateFiles });
			const provider = new TemplateEntityProvider(mockPlugin, {
				path: "Templates",
				actionType: "insert",
			});
			const results = provider.getEntityList();
			expect(results[0].icon).toBe("stamp");
		});

		test("each result has an action function", () => {
			const templateFiles = [
				createMockFile("Templates/Test.md"),
			];
			const mockPlugin = createMockPlugin({ "Templates": templateFiles });
			const provider = new TemplateEntityProvider(mockPlugin, {
				path: "Templates",
			});
			const results = provider.getEntityList();
			expect(results[0].action).toBeDefined();
			expect(typeof results[0].action).toBe("function");
		});
	});

	describe("settings", () => {
		test("getDescription instance method", () => {
			const mockPlugin = createMockPlugin({});
			const provider = new TemplateEntityProvider(mockPlugin, {
				path: "MyTemplates",
				actionType: "insert",
			});
			const desc = provider.getDescription();
			expect(desc).toBe("📄 Template entity provider - insert (MyTemplates)");
		});

		test("getDefaultSettings instance method matches static", () => {
			const mockPlugin = createMockPlugin({});
			const provider = new TemplateEntityProvider(mockPlugin, {});
			expect(provider.getDefaultSettings()).toEqual(
				TemplateEntityProvider.getDefaultSettings()
			);
		});
	});
});
