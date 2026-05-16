import type { Plugin } from "obsidian";
import type {
	EntityProvider,
	EntityProviderUserSettings,
} from "src/Providers/EntityProvider";
import { createNewNoteFromTemplate } from "src/entitiesUtilities";

/** Provider-supplied template target for creating one entity type. */
export interface EntityCreationDefinition {
	providerTypeID: string;
	entityName: string;
	templatePath?: string;
	folderPath?: string;
	icon?: string;
	description?: string;
	inputLabel?: string;
	examples?: string[];
	create?: EntityCreationHandler;
}

/** Creation definition with the stable CLI/UI target id assigned. */
export interface EntityCreationTarget extends EntityCreationDefinition {
	id: string;
}

/** Result returned after a template-backed entity note is created. */
export interface EntityCreationResult {
	id: string;
	entityName: string;
	name: string;
	link: string;
	templatePath?: string;
	folderPath?: string;
	path?: string;
}

export interface EntityCreationHandlerContext {
	plugin: Plugin;
	target: EntityCreationTarget;
	name: string;
	openNewNote: boolean;
}

export interface EntityCreationHandlerResult {
	link?: string;
	path?: string;
	templatePath?: string;
	folderPath?: string;
}

export type EntityCreationHandler = (
	context: EntityCreationHandlerContext
) => Promise<EntityCreationHandlerResult> | EntityCreationHandlerResult;

/** Request to create by exact target id or by a unique entity name. */
export type EntityCreationRequest =
	| {
			id: string;
			name: string;
			openNewNote?: boolean;
			entityName?: never;
	  }
	| {
			entityName: string;
			name: string;
			openNewNote?: boolean;
			id?: never;
	  };

/** Coordinates template-backed entity creation across enabled providers. */
export class EntityCreationService {
	constructor(
		private readonly plugin: Plugin,
		private readonly providers: EntityProvider<EntityProviderUserSettings>[]
	) {}

	/** Lists enabled provider creation targets with stable normalized ids. */
	listCreationTargets(): EntityCreationTarget[] {
		const assignedIds = new Map<string, number>();
		return this.providers
			.filter((provider) => provider.isEnabled)
			.flatMap((provider) => provider.getEntityCreationDefinitions())
			.map((definition) => {
				const idBase = `${normalizeIDPart(
					definition.providerTypeID,
					"provider"
				)}:${normalizeIDPart(definition.entityName, "entity")}`;
				const count = assignedIds.get(idBase) ?? 0;
				assignedIds.set(idBase, count + 1);
				const id = count === 0 ? idBase : `${idBase}-${count + 1}`;
				return {
					id,
					...definition,
				};
			});
	}

	/** Creates a note from the resolved target's template. */
	async create(request: EntityCreationRequest): Promise<EntityCreationResult> {
		const target = this.resolveTarget(request);
		const creationResult = await createEntityFromDefinition(
			this.plugin,
			target,
			request.name,
			request.openNewNote ?? false,
			target.id
		);

		return {
			id: target.id,
			entityName: target.entityName,
			name: request.name,
			link: creationResult.link ?? `[[${request.name}]]`,
			...(creationResult.templatePath
				? { templatePath: creationResult.templatePath }
				: {}),
			...(creationResult.folderPath !== undefined
				? { folderPath: creationResult.folderPath }
				: {}),
			...(creationResult.path ? { path: creationResult.path } : {}),
		};
	}

	private resolveTarget(request: EntityCreationRequest): EntityCreationTarget {
		const targets = this.listCreationTargets();
		if (request.id !== undefined) {
			const match = targets.find((target) => target.id === request.id);
			if (!match) {
				throw new Error(
					`No entity creation target found for id "${request.id}".`
				);
			}
			return match;
		}

		const requestedEntityName = normalizeEntityName(request.entityName);
		const matches = targets.filter(
			(target) => normalizeEntityName(target.entityName) === requestedEntityName
		);
		if (matches.length === 0) {
			throw new Error(
				`No entity creation target found for entity name "${request.entityName}".`
			);
		}
		if (matches.length > 1) {
			throw new Error(
				`Entity name "${request.entityName}" is ambiguous. Use one of these ids: ${matches
					.map((target) => target.id)
					.join(", ")}.`
			);
		}
		return matches[0];
	}
}

function normalizeIDPart(value: string, fallback: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return normalized.length > 0 ? normalized : fallback;
}

function normalizeEntityName(value: string): string {
	return value.toLowerCase();
}

export async function createEntityFromDefinition(
	plugin: Plugin,
	definition: EntityCreationDefinition,
	name: string,
	openNewNote: boolean,
	targetId = `${definition.providerTypeID}:${definition.entityName}`
): Promise<EntityCreationHandlerResult> {
	const target: EntityCreationTarget = {
		id: targetId,
		...definition,
	};

	if (definition.create) {
		return definition.create({
			plugin,
			target,
			name,
			openNewNote,
		});
	}

	if (!definition.templatePath) {
		throw new Error(
			`Entity creation target "${targetId}" does not define a template or creation handler.`
		);
	}

	const folderPath = definition.folderPath ?? "";
	const createdFile = await createNewNoteFromTemplate(
		plugin,
		definition.templatePath,
		folderPath,
		name,
		openNewNote
	);
	if (!createdFile) {
		throw new Error(
			`Entity creation failed for "${name}" using target "${targetId}".`
		);
	}

	return {
		link: `[[${name}]]`,
		templatePath: definition.templatePath,
		folderPath,
		path: createdFile.path,
	};
}
