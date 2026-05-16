import type { CliData, CliFlags, CliHandler, Plugin } from "obsidian";
import { EntityCreationService } from "../entityCreation/EntityCreationService";
import type { EntityCreationResult } from "../entityCreation/EntityCreationService";
import type ProviderRegistry from "../Providers/ProviderRegistry";

const LIST_FLAGS: CliFlags = {
	format: {
		value: "<text|json>",
		description: "Output format. Use json for automation.",
	},
};

const CREATE_FLAGS: CliFlags = {
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
};

type CliCapablePlugin = Plugin &
	Partial<Pick<Plugin, "registerCliHandler">>;

/** Registers native Obsidian CLI commands for template-backed entity creation. */
export function registerEntitiesCli(
	plugin: Plugin,
	providerRegistry: Pick<ProviderRegistry, "getProviders">
): void {
	const cliPlugin = plugin as CliCapablePlugin;
	if (typeof cliPlugin.registerCliHandler !== "function") {
		return;
	}

	const buildService = () =>
		new EntityCreationService(plugin, providerRegistry.getProviders());

	cliPlugin.registerCliHandler(
		"entities",
		"List configured Entities creation targets and stable ids for entities:create.",
		LIST_FLAGS,
		buildListHandler(buildService)
	);
	cliPlugin.registerCliHandler(
		"entities:create",
		"Create an entity note using a target id or unique entity name from `obsidian entities`.",
		CREATE_FLAGS,
		buildCreateHandler(buildService)
	);
}

function buildListHandler(buildService: () => EntityCreationService): CliHandler {
	return (params: CliData) => {
		const service = buildService();
		const targets = service.listCreationTargets();
		if (params.format === "json") {
			return stringifyPretty(
				targets.map((target) => ({
					id: target.id,
					entity: target.entityName,
					provider: target.providerTypeID,
					...(target.description
						? { description: target.description }
						: {}),
					...(target.inputLabel ? { inputLabel: target.inputLabel } : {}),
					...(target.examples ? { examples: target.examples } : {}),
					...(target.templatePath
						? { templatePath: target.templatePath }
						: {}),
					...(target.folderPath !== undefined
						? { folderPath: target.folderPath }
						: {}),
					...(target.icon ? { icon: target.icon } : {}),
				}))
			);
		}

		if (targets.length === 0) {
			return "No entity creation targets configured.";
		}

		return [
			"id\tentity\tprovider\tdescription\tinputLabel\texamples\ttemplatePath\tfolderPath\ticon",
			...targets.map((target) =>
				[
					target.id,
					target.entityName,
					target.providerTypeID,
					target.description ?? "",
					target.inputLabel ?? "",
					target.examples?.join(", ") ?? "",
					target.templatePath ?? "",
					target.folderPath ?? "",
					target.icon ?? "",
				].join("\t")
			),
		].join("\n");
	};
}

function buildCreateHandler(
	buildService: () => EntityCreationService
): CliHandler {
	return async (params: CliData) => {
		const service = buildService();
		const entity = getRequiredStringParam(params, "entity");
		const name = getRequiredStringParam(params, "name");
		const result = await service.create({
			...(entity.includes(":") ? { id: entity } : { entityName: entity }),
			name,
			openNewNote: params.open === "true",
		});

		if (params.format === "json") {
			return stringifyPretty(toCreateJson(result));
		}

		return result.link;
	};
}

function getRequiredStringParam(params: CliData, key: "entity" | "name"): string {
	const value = params[key];
	if (value === undefined || value === "true") {
		throw new Error(`Entities: missing required parameter "${key}".`);
	}
	return value;
}

function toCreateJson(result: EntityCreationResult): Record<string, string> {
	return {
		entity: result.entityName,
		id: result.id,
		name: result.name,
		link: result.link,
		...(result.path ? { path: result.path } : {}),
		...(result.templatePath ? { templatePath: result.templatePath } : {}),
		...(result.folderPath !== undefined ? { folderPath: result.folderPath } : {}),
	};
}

function stringifyPretty(value: unknown): string {
	return JSON.stringify(value, null, 2);
}
