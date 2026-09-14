import { App, TFile, TFolder, normalizePath, moment } from "obsidian";
import { AppWithPlugins, entityFromTemplateSettings, PeriodicNotesGranularity, TemplaterPlugin } from "./entities.types";
import { lookupPeriodicFile } from "./periodicNotes";
import { captureDateRoute, DateRouteSnapshot, matchesDateRoute } from "./dateNotes";
import { invokeCoreDailyNote, recheckCoreDailyFile } from "./coreDailyNotes";

/** Confirmed vault outcomes, independent of prompts, editors and link formatting. */
export type CreationResult =
	| { status: "created"; file: TFile }
	| { status: "existing"; file: TFile }
	| { status: "cancelled" }
	| { status: "failed"; error: Error; partialFile?: TFile };

/** Configured empty paths mean root; default destinations are resolved by the caller. */
export type CreationDestination =
	| { kind: "explicit"; path: string }
	| { kind: "resolved"; folder: TFolder };

/** Template strings are vault paths, never literal template content. Collisions use native unique naming. */
export interface TemplateCreationRequest {
	engine: entityFromTemplateSettings["engine"];
	template: TFile | string;
	destination: CreationDestination;
	name: string;
}

/** Convert integration exceptions without assuming ownership of a partial file. */
export function creationFailure(error: unknown): Extract<CreationResult, { status: "failed" }> {
	return { status: "failed", error: error instanceof Error ? error : new Error(String(error)) };
}

/** Return only the creation capability; append support is unrelated. Resolve on each action. */
export function getTemplaterCreationEngine(app: App): TemplaterPlugin["templater"] | undefined {
	const plugin = (app as AppWithPlugins).plugins?.getPlugin?.("templater-obsidian") as TemplaterPlugin | undefined;
	return typeof plugin?.templater?.create_new_note_from_template === "function" ? plugin.templater : undefined;
}

/** A path match alone cannot confirm a deleted/recreated or fabricated file. */
export function requireLiveFile(app: App, file: unknown): TFile {
	if (!(file instanceof TFile) || app.vault.getAbstractFileByPath(file.path) !== file) {
		throw new Error("The operation did not return a live vault file.");
	}
	return file;
}

function requireLiveFolder(app: App, folder: TFolder): TFolder {
	if (!(folder instanceof TFolder) || (app.vault.getRoot() !== folder && app.vault.getAbstractFileByPath(folder.path) !== folder)) {
		throw new Error("The destination folder is no longer available.");
	}
	return folder;
}

function hasControlCharacters(value: string): boolean {
	return Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function resolveDestination(app: App, destination: CreationDestination): TFolder | string {
	if (destination.kind === "resolved") return requireLiveFolder(app, destination.folder);
	if (hasControlCharacters(destination.path)) throw new Error("Use a valid folder path inside the vault.");
	// Ordinary spaces are part of the configured vault path, including an all-space folder name.
	const raw = destination.path.replace(/\\/g, "/");
	if (!raw || raw === "/") return requireLiveFolder(app, app.vault.getRoot());
	if (raw.startsWith("/") || /[:*?"<>|]/.test(raw) || raw.split("/").some(part => part === "." || part === "..")) {
		throw new Error("Use a valid folder path inside the vault.");
	}
	const path = normalizePath(raw);
	const parts = path.split("/");
	for (let i = 1; i <= parts.length; i++) {
		const prefix = parts.slice(0, i).join("/");
		const existing = app.vault.getAbstractFileByPath(prefix);
		if (existing && !(existing instanceof TFolder)) throw new Error("A file blocks the destination folder.");
	}
	// Native Templater creates missing parents. Do not delete them after later failure.
	return path;
}

function validateName(name: string): void {
	if (!name.trim() || name === "." || name === ".." || hasControlCharacters(name) || /[\\/:*?"<>|]/.test(name)) {
		throw new Error("Enter a valid note name without folder separators.");
	}
}

/** Resolve the public default parent before a prompt or engine can change active source context. */
export function resolveDefaultCreationDestination(app: App, sourcePath: string, proposedPath: string): CreationDestination {
	return { kind: "resolved", folder: requireLiveFolder(app, app.fileManager.getNewFileParent(sourcePath, proposedPath)) };
}

/** Await native creation and confirm its actual renamed/suffixed file. Never infer success or rollback. */
export async function createNewNoteFromTemplate(app: App, request: TemplateCreationRequest): Promise<CreationResult> {
	try {
		if (request.engine !== "templater") throw new Error("This recipe's template engine is unsupported. Choose Templater in its settings.");
		validateName(request.name);
		const template = typeof request.template === "string" ? app.vault.getAbstractFileByPath(request.template) : request.template;
		if (!(template instanceof TFile) || app.vault.getAbstractFileByPath(template.path) !== template) throw new Error("The template file is missing or no longer available.");
		const folder = resolveDestination(app, request.destination);
		const engine = getTemplaterCreationEngine(app);
		if (!engine?.create_new_note_from_template) throw new Error("Templater note creation is unavailable. Enable a compatible Templater plugin.");
		const returned = await engine.create_new_note_from_template(template, folder, request.name, false);
		return { status: "created", file: requireLiveFile(app, returned) };
	} catch (error) {
		return creationFailure(error);
	}
}

/** A retained Date action supplies its route and the coordinator's pre-start guard. */
export interface PeriodicCreationOptions {
	expectedRoute?: DateRouteSnapshot;
	canStartWork?: () => boolean;
}

/** Guard the current route before native work; once started, native side effects cannot be cancelled. */
export async function createOrReusePeriodicNote(
	app: App, granularity: PeriodicNotesGranularity, date: moment.Moment, options: PeriodicCreationOptions = {}
): Promise<CreationResult> {
	try {
		if (options.canStartWork && !options.canStartWork()) return { status: "cancelled" };
		if (!moment.isMoment(date) || !date.isValid()) throw new Error("The periodic date is invalid.");
		const current = captureDateRoute(app, granularity);
		const expected = options.expectedRoute;
		if (current.kind !== "ready" || (expected && !matchesDateRoute(expected, current))) {
			throw new Error("The date note destination changed or is unavailable. Refresh the suggestions and retry.");
		}
		const route = current.snapshot;
		const existing = route.engine === "core-daily" ? recheckCoreDailyFile(app, route, date) : lookupPeriodicFile(app, route, date);
		if (!matchesDateRoute(route, captureDateRoute(app, granularity))) {
			throw new Error("The date note destination changed during lookup. Refresh the suggestions and retry.");
		}
		if (existing != null) return { status: "existing", file: requireLiveFile(app, existing) };
		if (!route.create) throw new Error("Periodic Notes creation is unavailable.");
		if (options.canStartWork && !options.canStartWork()) return { status: "cancelled" };
		return { status: "created", file: requireLiveFile(app, await (route.engine === "core-daily" ?
			invokeCoreDailyNote(route, date) : route.create.call(route.plugin, granularity, date.clone()))) };
	} catch (error) {
		return creationFailure(error);
	}
}
