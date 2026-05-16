import type { CliFlags, CliHandler, Plugin } from "obsidian";
import { registerEntitiesCli } from "../../src/cli/EntitiesCli";
import type {
	EntityProvider,
	EntityProviderUserSettings,
} from "../../src/Providers/EntityProvider";
import type { EntityCreationDefinition } from "../../src/entityCreation/EntityCreationService";
import { createNewNoteFromTemplate } from "../../src/entitiesUtilities";

jest.mock("../../src/entitiesUtilities", () => ({
	createNewNoteFromTemplate: jest.fn(),
}));

interface RegisteredCliHandler {
	command: string;
	description: string;
	flags: CliFlags | null;
	handler: CliHandler;
}

const mockedCreateNewNoteFromTemplate = jest.mocked(createNewNoteFromTemplate);

function provider(
	providerTypeID: string,
	definitions: Omit<EntityCreationDefinition, "providerTypeID">[],
	enabled = true
): EntityProvider<EntityProviderUserSettings> {
	return {
		isEnabled: enabled,
		getEntityCreationDefinitions: () =>
			definitions.map((definition) => ({
				...definition,
				providerTypeID,
			})),
	} as EntityProvider<EntityProviderUserSettings>;
}

function registerWithProviders(
	providers: EntityProvider<EntityProviderUserSettings>[]
): RegisteredCliHandler[] {
	const handlers: RegisteredCliHandler[] = [];
	const plugin = {
		registerCliHandler: jest.fn(
			(
				command: string,
				description: string,
				flags: CliFlags | null,
				handler: CliHandler
			) => {
				handlers.push({ command, description, flags, handler });
			}
		),
	} as unknown as Plugin;
	const providerRegistry = {
		getProviders: jest.fn(() => providers),
	};

	registerEntitiesCli(plugin, providerRegistry);

	return handlers;
}

function handlerFor(
	handlers: RegisteredCliHandler[],
	command: string
): RegisteredCliHandler {
	const handler = handlers.find((item) => item.command === command);
	if (!handler) {
		throw new Error(`Missing handler for ${command}`);
	}
	return handler;
}

describe("registerEntitiesCli", () => {
	beforeEach(() => {
		mockedCreateNewNoteFromTemplate.mockReset();
	});

	test("does not throw or load providers when native CLI registration is unavailable", () => {
		const plugin = {} as Plugin;
		const providerRegistry = {
			getProviders: jest.fn(),
		};

		expect(() => registerEntitiesCli(plugin, providerRegistry)).not.toThrow();
		expect(providerRegistry.getProviders).not.toHaveBeenCalled();
	});

	test("registers list and create CLI commands", () => {
		const handlers = registerWithProviders([]);

		expect(handlers.map((handler) => handler.command)).toEqual([
			"entities",
			"entities:create",
		]);
		expect(handlerFor(handlers, "entities").flags).toEqual({
			format: {
				value: "<text|json>",
				description: "Output format. Use json for automation.",
			},
		});
		expect(handlerFor(handlers, "entities:create").flags).toEqual({
			entity: {
				value: "<entity>",
				description:
					"Target id from `obsidian entities`, such as folder:person, or a unique entity name such as person.",
				required: true,
			},
			name: {
				value: "<name>",
				description: "Name for the created entity note.",
				required: true,
			},
			open: {
				description: "Open the created note after creation.",
			},
			format: {
				value: "<text|json>",
				description: "Output format. Use json for automation.",
			},
		});
	});

	test("lists configured creation targets as deterministic text", async () => {
		const handlers = registerWithProviders([
			provider("People Provider", [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
					icon: "user",
				},
				{
					entityName: "Project",
					templatePath: "Templates/Project.md",
					folderPath: "Projects",
				},
			]),
		]);

		await expect(
			Promise.resolve(handlerFor(handlers, "entities").handler({}))
		).resolves.toBe(
			[
				"id\tentity\tprovider\ttemplatePath\tfolderPath\ticon",
				"people-provider:person\tPerson\tPeople Provider\tTemplates/Person.md\tPeople\tuser",
				"people-provider:project\tProject\tPeople Provider\tTemplates/Project.md\tProjects\t",
			].join("\n")
		);
	});

	test("returns an empty-target message for text list output", async () => {
		const handlers = registerWithProviders([]);

		await expect(
			Promise.resolve(handlerFor(handlers, "entities").handler({}))
		).resolves.toBe(
			"No entity creation targets configured."
		);
	});

	test("lists configured creation targets as pretty JSON", async () => {
		const handlers = registerWithProviders([
			provider("People Provider", [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
					icon: "user",
				},
				{
					entityName: "Project",
					templatePath: "Templates/Project.md",
					folderPath: "Projects",
				},
			]),
		]);

		await expect(
			Promise.resolve(
				handlerFor(handlers, "entities").handler({ format: "json" })
			)
		).resolves.toBe(
			JSON.stringify(
				[
					{
						id: "people-provider:person",
						entity: "Person",
						provider: "People Provider",
						templatePath: "Templates/Person.md",
						folderPath: "People",
						icon: "user",
					},
					{
						id: "people-provider:project",
						entity: "Project",
						provider: "People Provider",
						templatePath: "Templates/Project.md",
						folderPath: "Projects",
					},
				],
				null,
				2
			)
		);
	});

	test("list handler resolves providers from the registry for each invocation", async () => {
		let providers = [
			provider("People Provider", [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
				},
			]),
		];
		const handlers: RegisteredCliHandler[] = [];
		const plugin = {
			registerCliHandler: jest.fn(
				(
					command: string,
					description: string,
					flags: CliFlags | null,
					handler: CliHandler
				) => {
					handlers.push({ command, description, flags, handler });
				}
			),
		} as unknown as Plugin;
		const providerRegistry = {
			getProviders: jest.fn(() => providers),
		};
		registerEntitiesCli(plugin, providerRegistry);
		providers = [
			provider("Projects Provider", [
				{
					entityName: "Project",
					templatePath: "Templates/Project.md",
					folderPath: "Projects",
				},
			]),
		];

		await expect(
			Promise.resolve(
				handlerFor(handlers, "entities").handler({ format: "json" })
			)
		).resolves.toBe(
			JSON.stringify(
				[
					{
						id: "projects-provider:project",
						entity: "Project",
						provider: "Projects Provider",
						templatePath: "Templates/Project.md",
						folderPath: "Projects",
					},
				],
				null,
				2
			)
		);
		expect(providerRegistry.getProviders).toHaveBeenCalledTimes(1);
	});

	test("creates by exact id and returns the created link as text", async () => {
		mockedCreateNewNoteFromTemplate.mockResolvedValue({
			path: "People/Alice.md",
		});
		const handlers = registerWithProviders([
			provider("People Provider", [
				{
					entityName: "Person",
					templatePath: "Templates/Person.md",
					folderPath: "People",
				},
			]),
		]);

		await expect(
			handlerFor(handlers, "entities:create").handler({
				entity: "people-provider:person",
				name: "Alice",
				open: "true",
			})
		).resolves.toBe("[[Alice]]");
		expect(mockedCreateNewNoteFromTemplate).toHaveBeenCalledWith(
			expect.anything(),
			"Templates/Person.md",
			"People",
			"Alice",
			true
		);
	});

	test("creates by unique entity name and returns pretty JSON", async () => {
		mockedCreateNewNoteFromTemplate.mockResolvedValue({
			path: "Projects/Launch.md",
		});
		const handlers = registerWithProviders([
			provider("Projects Provider", [
				{
					entityName: "Project",
					templatePath: "Templates/Project.md",
					folderPath: "Projects",
				},
			]),
		]);

		await expect(
			handlerFor(handlers, "entities:create").handler({
				entity: "project",
				name: "Launch",
				format: "json",
			})
		).resolves.toBe(
			JSON.stringify(
				{
					entity: "Project",
					id: "projects-provider:project",
					name: "Launch",
					link: "[[Launch]]",
					path: "Projects/Launch.md",
					templatePath: "Templates/Project.md",
					folderPath: "Projects",
				},
				null,
				2
			)
		);
		expect(mockedCreateNewNoteFromTemplate).toHaveBeenCalledWith(
			expect.anything(),
			"Templates/Project.md",
			"Projects",
			"Launch",
			false
		);
	});

	test("throws clear errors when create required parameters are missing", async () => {
		const handlers = registerWithProviders([]);
		const createHandler = handlerFor(handlers, "entities:create").handler;

		await expect(createHandler({ name: "Alice" })).rejects.toThrow(
			'Entities: missing required parameter "entity".'
		);
		await expect(createHandler({ entity: "person" })).rejects.toThrow(
			'Entities: missing required parameter "name".'
		);
		await expect(createHandler({ entity: "true", name: "Alice" })).rejects.toThrow(
			'Entities: missing required parameter "entity".'
		);
		await expect(createHandler({ entity: "person", name: "true" })).rejects.toThrow(
			'Entities: missing required parameter "name".'
		);
	});
});
