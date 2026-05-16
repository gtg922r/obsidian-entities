import { Plugin, TFile } from "obsidian";
import {
	EntityCreationDefinition,
	EntityCreationService,
} from "../../src/entityCreation/EntityCreationService";
import {
	EntityProvider,
	EntityProviderUserSettings,
} from "../../src/Providers/EntityProvider";
import { TriggerCharacter } from "../../src/entities.types";
import { EntitySuggestionItem } from "../../src/EntitiesSuggestor";
import { createNewNoteFromTemplate } from "../../src/entitiesUtilities";

jest.mock("obsidian", () => ({
	Plugin: class {
		app: unknown;
		constructor(app: unknown) {
			this.app = app;
		}
	},
	TFile: class {
		path: string;
		constructor(path: string) {
			this.path = path;
		}
	},
}));

jest.mock("../../src/entitiesUtilities", () => ({
	createNewNoteFromTemplate: jest.fn(),
}));

interface TestProviderSettings extends EntityProviderUserSettings {
	providerTypeID: string;
}

class CreationProvider extends EntityProvider<TestProviderSettings> {
	private readonly definitions: EntityCreationDefinition[];

	constructor(
		plugin: Plugin,
		settings: Partial<TestProviderSettings>,
		definitions: EntityCreationDefinition[]
	) {
		super(plugin, settings);
		this.definitions = definitions;
	}

	getDefaultSettings(): TestProviderSettings {
		return {
			providerTypeID: "test-provider",
			enabled: true,
			icon: "test-icon",
		};
	}

	getEntityList(_query: string, _trigger: TriggerCharacter): EntitySuggestionItem[] {
		return [];
	}

	getEntityCreationDefinitions(): EntityCreationDefinition[] {
		return this.definitions;
	}
}

const plugin = {} as Plugin;
const mockedCreateNewNoteFromTemplate = jest.mocked(createNewNoteFromTemplate);

function provider(
	providerTypeID: string,
	enabled: boolean,
	definitions: Omit<EntityCreationDefinition, "providerTypeID">[]
): CreationProvider {
	return new CreationProvider(
		plugin,
		{
			providerTypeID,
			enabled,
			icon: "test-icon",
		},
		definitions.map((definition) => ({
			...definition,
			providerTypeID,
		}))
	);
}

describe("EntityCreationService", () => {
	beforeEach(() => {
		mockedCreateNewNoteFromTemplate.mockReset();
	});

	test("lists creation targets from enabled providers with stable normalized ids", () => {
		const service = new EntityCreationService(plugin, [
			provider("Folder Provider", true, [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
				},
				{
					entityName: "Movie Character",
					templatePath: "Templates/Character.md",
					folderPath: "",
				},
			]),
			provider("Disabled Provider", false, [
				{
					entityName: "Should Not Appear",
					templatePath: "Templates/Hidden.md",
					folderPath: "Hidden",
				},
			]),
		]);

		expect(service.listCreationTargets()).toEqual([
			{
				id: "folder-provider:person",
				providerTypeID: "Folder Provider",
				entityName: "Person",
				templatePath: "Templates/Person.md",
				folderPath: "People",
			},
			{
				id: "folder-provider:movie-character",
				providerTypeID: "Folder Provider",
				entityName: "Movie Character",
				templatePath: "Templates/Character.md",
				folderPath: "",
			},
		]);
	});

	test("keeps distinct normalized ids without suffixes", () => {
		const service = new EntityCreationService(plugin, [
			provider("Characters", true, [
				{
					entityName: "NPC",
					templatePath: "Templates/NPC.md",
					folderPath: "Characters",
				},
				{
					entityName: "N.P.C.",
					templatePath: "Templates/NPC Alternate.md",
					folderPath: "Characters",
				},
			]),
		]);

		expect(service.listCreationTargets().map((target) => target.id)).toEqual([
			"characters:npc",
			"characters:n-p-c",
		]);
	});

	test("adds numeric suffixes when duplicate ids remain after normalization", () => {
		const service = new EntityCreationService(plugin, [
			provider("Characters", true, [
				{
					entityName: "NPC",
					templatePath: "Templates/NPC.md",
					folderPath: "Characters",
				},
				{
					entityName: "NPC!",
					templatePath: "Templates/NPC Bang.md",
					folderPath: "Characters",
				},
			]),
		]);

		expect(service.listCreationTargets().map((target) => target.id)).toEqual([
			"characters:npc",
			"characters:npc-2",
		]);
	});

	test("uses fallback id parts when provider or entity names normalize empty", () => {
		const service = new EntityCreationService(plugin, [
			provider("!!!", true, [
				{
					entityName: "???",
					templatePath: "Templates/Symbol.md",
					folderPath: "Symbols",
				},
				{
					entityName: "...",
					templatePath: "Templates/Symbol Alternate.md",
					folderPath: "Symbols",
				},
			]),
		]);

		expect(service.listCreationTargets().map((target) => target.id)).toEqual([
			"provider:entity",
			"provider:entity-2",
		]);
	});

	test("creates by exact id and returns creation result details", async () => {
		const createdFile = new TFile("People/Alice.md");
		mockedCreateNewNoteFromTemplate.mockResolvedValue(createdFile);
		const service = new EntityCreationService(plugin, [
			provider("Folder Provider", true, [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
				},
			]),
		]);

		await expect(
			service.create({
				id: "folder-provider:person",
				name: "Alice",
				openNewNote: true,
			})
		).resolves.toEqual({
			id: "folder-provider:person",
			entityName: "Person",
			name: "Alice",
			link: "[[Alice]]",
			templatePath: "Templates/Person.md",
			folderPath: "People",
			path: "People/Alice.md",
		});
		expect(mockedCreateNewNoteFromTemplate).toHaveBeenCalledWith(
			plugin,
			"Templates/Person.md",
			"People",
			"Alice",
			true
		);
	});

	test("creates by unique entity name with openNewNote defaulting to false", async () => {
		const createdFile = new TFile("People/Bob.md");
		mockedCreateNewNoteFromTemplate.mockResolvedValue(createdFile);
		const service = new EntityCreationService(plugin, [
			provider("People", true, [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
				},
			]),
		]);

		await expect(
			service.create({
				entityName: "Person",
				name: "Bob",
			})
		).resolves.toEqual({
			id: "people:person",
			entityName: "Person",
			name: "Bob",
			link: "[[Bob]]",
			templatePath: "Templates/Person.md",
			folderPath: "People",
			path: "People/Bob.md",
		});
		expect(mockedCreateNewNoteFromTemplate).toHaveBeenCalledWith(
			plugin,
			"Templates/Person.md",
			"People",
			"Bob",
			false
		);
	});

	test("creates by unique entity name case-insensitively", async () => {
		const createdFile = new TFile("People/Bob.md");
		mockedCreateNewNoteFromTemplate.mockResolvedValue(createdFile);
		const service = new EntityCreationService(plugin, [
			provider("People", true, [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
				},
			]),
		]);

		await expect(
			service.create({
				entityName: "person",
				name: "Bob",
			})
		).resolves.toEqual({
			id: "people:person",
			entityName: "Person",
			name: "Bob",
			link: "[[Bob]]",
			templatePath: "Templates/Person.md",
			folderPath: "People",
			path: "People/Bob.md",
		});
		expect(mockedCreateNewNoteFromTemplate).toHaveBeenCalledWith(
			plugin,
			"Templates/Person.md",
			"People",
			"Bob",
			false
		);
	});

	test("throws a clear error when template creation returns no file", async () => {
		mockedCreateNewNoteFromTemplate.mockResolvedValue(undefined);
		const service = new EntityCreationService(plugin, [
			provider("People", true, [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
				},
			]),
		]);

		await expect(
			service.create({
				entityName: "Person",
				name: "Bob",
			})
		).rejects.toThrow(
			'Entity creation failed for "Bob" using target "people:person".'
		);
	});

	test("throws a clear error when no id matches", async () => {
		const service = new EntityCreationService(plugin, [
			provider("People", true, [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
				},
			]),
		]);

		await expect(
			service.create({
				id: "people:project",
				name: "Launch",
			})
		).rejects.toThrow('No entity creation target found for id "people:project".');
	});

	test("throws a clear error when no entity name matches", async () => {
		const service = new EntityCreationService(plugin, [
			provider("People", true, [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
				},
			]),
		]);

		await expect(
			service.create({
				entityName: "Project",
				name: "Launch",
			})
		).rejects.toThrow('No entity creation target found for entity name "Project".');
	});

	test("throws a clear error for ambiguous entity names", async () => {
		const service = new EntityCreationService(plugin, [
			provider("People", true, [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
				},
			]),
			provider("Characters", true, [
				{
					entityName: "Person",
					templatePath: "Templates/Character.md",
					folderPath: "Characters",
				},
			]),
		]);

		await expect(
			service.create({
				entityName: "Person",
				name: "Alice",
			})
		).rejects.toThrow(
			'Entity name "Person" is ambiguous. Use one of these ids: people:person, characters:person.'
		);
	});
});
