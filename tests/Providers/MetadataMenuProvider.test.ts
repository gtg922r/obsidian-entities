import { Plugin, TFile } from "obsidian";
import { MetadataMenuProvider } from "../../src/Providers/MetadataMenuProvider";
import { buildEntityCreationSuggestions } from "../../src/entityCreation/EntityCreationSuggestions";
import { EntitySuggestionItem } from "../../src/EntitiesSuggestor";

jest.mock("obsidian", () => {
	class MockTFile {
		path: string;

		constructor(path: string) {
			this.path = path;
		}
	}

	return {
		ExtraButtonComponent: class {},
		Plugin: class {
			app: unknown;

			constructor(app: unknown) {
				this.app = app;
			}
		},
		SearchResult: class {},
		Setting: class {},
		TFile: MockTFile,
	};
});

jest.mock("../../src/entityCreation/EntityCreationSuggestions", () => ({
	buildEntityCreationSuggestions: jest.fn(),
}));

jest.mock("../../src/ui/validationStatus", () => ({
	setValidationStatus: jest.fn(),
}));

interface TestFileClass {
	name: string;
	options?: {
		icon?: string;
	};
}

interface TestPluginApp {
	metadataCache: {
		getCache: jest.Mock;
		getFirstLinkpathDest: jest.Mock;
	};
	plugins: {
		getPlugin: jest.Mock;
	};
}

const mockedBuildEntityCreationSuggestions = jest.mocked(
	buildEntityCreationSuggestions
);

function createTemplate(path: string): TFile {
	return new TFile(path);
}

function createProvider(
	fileClassesPath?: Map<string, TestFileClass>,
	options?: {
		caches?: Record<string, unknown>;
		resolvedTemplates?: Record<string, TFile | null>;
		providerTypeID?: string;
	}
): {
	provider: MetadataMenuProvider;
	app: TestPluginApp;
} {
	const app: TestPluginApp = {
		metadataCache: {
			getCache: jest.fn((path: string) => options?.caches?.[path] ?? null),
			getFirstLinkpathDest: jest.fn(
				(linkpath: string) => options?.resolvedTemplates?.[linkpath] ?? null
			),
		},
		plugins: {
			getPlugin: jest.fn(() =>
				fileClassesPath
					? {
							fieldIndex: {
								fileClassesName: new Map(
									Array.from(fileClassesPath.values()).map((fileClass) => [
										fileClass.name,
										fileClass,
									])
								),
								fileClassesPath,
							},
					  }
					: undefined
			),
		},
	};
	const provider = new MetadataMenuProvider(new Plugin(app), {
		providerTypeID: options?.providerTypeID ?? "custom-mdm",
	});

	return { provider, app };
}

describe("MetadataMenuProvider", () => {
	beforeEach(() => {
		mockedBuildEntityCreationSuggestions.mockReset();
	});

	describe("getEntityCreationDefinitions", () => {
		test("returns empty definitions when Metadata Menu is unavailable", () => {
			const { provider } = createProvider(undefined);

			expect(provider.getEntityCreationDefinitions()).toEqual([]);
		});

		test("builds definitions from Metadata Menu file classes with resolved templates", () => {
			const personTemplate = createTemplate("Templates/Person.md");
			const projectTemplate = createTemplate("Templates/Project.md");
			const fileClassesPath = new Map<string, TestFileClass>([
				["FileClasses/Person.md", { name: "Person", options: { icon: "user" } }],
				["FileClasses/Project.md", { name: "Project" }],
				["FileClasses/Missing Template.md", { name: "Missing Template" }],
				["FileClasses/Missing Frontmatter.md", { name: "Missing Frontmatter" }],
				["FileClasses/Missing Link.md", { name: "Missing Link" }],
			]);
			const { provider, app } = createProvider(fileClassesPath, {
				caches: {
					"FileClasses/Person.md": {
						frontmatter: {
							newNoteTemplate: "[[Templates/Person]]",
							newEntityIcon: "id-card",
						},
					},
					"FileClasses/Project.md": {
						frontmatter: {
							newNoteTemplate: ["Templates/Project"],
						},
					},
					"FileClasses/Missing Template.md": {
						frontmatter: {
							newNoteTemplate: "[[Templates/Missing]]",
						},
					},
					"FileClasses/Missing Frontmatter.md": {},
					"FileClasses/Missing Link.md": {
						frontmatter: {},
					},
				},
				resolvedTemplates: {
					"Templates/Person": personTemplate,
					"Templates/Project": projectTemplate,
				},
			});

			expect(provider.getEntityCreationDefinitions()).toEqual([
				{
					providerTypeID: "custom-mdm",
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "",
					icon: "id-card",
				},
				{
					providerTypeID: "custom-mdm",
					entityName: "Project",
					templatePath: "Templates/Project.md",
					folderPath: "",
					icon: "plus-circle",
				},
			]);
			expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith(
				"Templates/Person",
				"FileClasses/Person.md"
			);
			expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith(
				"Templates/Project",
				"FileClasses/Project.md"
			);
		});

		test("uses file class icon when frontmatter icon is missing", () => {
			const template = createTemplate("Templates/Person.md");
			const { provider } = createProvider(
				new Map<string, TestFileClass>([
					["FileClasses/Person.md", { name: "Person", options: { icon: "user" } }],
				]),
				{
					caches: {
						"FileClasses/Person.md": {
							frontmatter: {
								newNoteTemplate: "[[Templates/Person]]",
							},
						},
					},
					resolvedTemplates: {
						"Templates/Person": template,
					},
				}
			);

			expect(provider.getEntityCreationDefinitions()[0]).toMatchObject({
				icon: "user",
			});
		});

		test("resolves aliased template wikilinks and plain linkpaths", () => {
			const personTemplate = createTemplate("Templates/Person.md");
			const projectTemplate = createTemplate("Templates/Project.md");
			const fileClassesPath = new Map<string, TestFileClass>([
				["FileClasses/Person.md", { name: "Person" }],
				["FileClasses/Project.md", { name: "Project" }],
			]);
			const { provider, app } = createProvider(fileClassesPath, {
				caches: {
					"FileClasses/Person.md": {
						frontmatter: {
							newNoteTemplate: "[[Templates/Person|Person template]]",
						},
					},
					"FileClasses/Project.md": {
						frontmatter: {
							newNoteTemplate: "Templates/Project|Project template",
						},
					},
				},
				resolvedTemplates: {
					"Templates/Person": personTemplate,
					"Templates/Project": projectTemplate,
				},
			});

			expect(provider.getEntityCreationDefinitions()).toEqual([
				{
					providerTypeID: "custom-mdm",
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "",
					icon: "plus-circle",
				},
				{
					providerTypeID: "custom-mdm",
					entityName: "Project",
					templatePath: "Templates/Project.md",
					folderPath: "",
					icon: "plus-circle",
				},
			]);
			expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith(
				"Templates/Person",
				"FileClasses/Person.md"
			);
			expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith(
				"Templates/Project",
				"FileClasses/Project.md"
			);
		});

		test("omits malformed wrapped template values without resolving them", () => {
			const personTemplate = createTemplate("Templates/Person.md");
			const projectTemplate = createTemplate("Templates/Project.md");
			const fileClassesPath = new Map<string, TestFileClass>([
				["FileClasses/Person.md", { name: "Person" }],
				["FileClasses/Project.md", { name: "Project" }],
			]);
			const { provider, app } = createProvider(fileClassesPath, {
				caches: {
					"FileClasses/Person.md": {
						frontmatter: {
							newNoteTemplate: "[[Templates/Person",
						},
					},
					"FileClasses/Project.md": {
						frontmatter: {
							newNoteTemplate: "Templates/Project]]",
						},
					},
				},
				resolvedTemplates: {
					"Templates/Person": personTemplate,
					"Templates/Project": projectTemplate,
				},
			});

			expect(provider.getEntityCreationDefinitions()).toEqual([]);
			expect(app.metadataCache.getFirstLinkpathDest).not.toHaveBeenCalledWith(
				"Templates/Person",
				"FileClasses/Person.md"
			);
			expect(app.metadataCache.getFirstLinkpathDest).not.toHaveBeenCalledWith(
				"Templates/Project",
				"FileClasses/Project.md"
			);
		});
	});

	describe("getTemplateCreationSuggestions", () => {
		test("delegates creation suggestions to shared builder", () => {
			const suggestion = { suggestionText: "New Person: Alice" } as EntitySuggestionItem;
			mockedBuildEntityCreationSuggestions.mockReturnValue([suggestion]);
			const template = createTemplate("Templates/Person.md");
			const { provider } = createProvider(
				new Map<string, TestFileClass>([
					["FileClasses/Person.md", { name: "Person" }],
				]),
				{
					caches: {
						"FileClasses/Person.md": {
							frontmatter: {
								newNoteTemplate: "[[Templates/Person]]",
							},
						},
					},
					resolvedTemplates: {
						"Templates/Person": template,
					},
				}
			);

			expect(provider.getTemplateCreationSuggestions("Alice")).toEqual([
				suggestion,
			]);
			expect(mockedBuildEntityCreationSuggestions).toHaveBeenCalledWith(
				provider.plugin,
				[
					{
						providerTypeID: "custom-mdm",
						entityName: "Person",
						templatePath: "Templates/Person.md",
						folderPath: "",
						icon: "plus-circle",
					},
				],
				"Alice"
			);
		});
	});
});
