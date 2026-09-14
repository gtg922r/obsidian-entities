import { App, TAbstractFile, TFile, TFolder, moment, normalizePath } from "obsidian";

interface CoreDailyInstance {
	options?: { format?: unknown; folder?: unknown; template?: unknown };
	getFormat?: () => unknown;
	getDailyNote?: (date: moment.Moment) => Promise<unknown>;
}

interface CoreDailyWrapper {
	enabled?: unknown;
	instance?: CoreDailyInstance;
}

/** All feature-detected private Core and vault capabilities stay at this boundary. */
interface CoreDailyApp extends App {
	internalPlugins?: { getPluginById?: (id: string) => CoreDailyWrapper | undefined };
	vault: App["vault"] & { getAbstractFileByPathInsensitive?: (path: string) => TAbstractFile | null };
}

/** Copied native options and effective parent, with the identities used at selection. */
export interface CoreDailyRouteSnapshot {
	readonly engine: "core-daily";
	readonly granularity: "day";
	readonly wrapper: CoreDailyWrapper;
	readonly instance: CoreDailyInstance;
	readonly enabled: true;
	readonly configuredFormat: string | undefined;
	readonly configuredFolder: string | undefined;
	readonly configuredTemplate: string | undefined;
	readonly format: string;
	readonly folder: string;
	readonly templatePath: string;
	readonly parent: TFolder;
	readonly parentPath: string;
	readonly parentPrefix: string;
	readonly getFormat: NonNullable<CoreDailyInstance["getFormat"]>;
	readonly create: NonNullable<CoreDailyInstance["getDailyNote"]>;
	readonly lookupInsensitive: NonNullable<CoreDailyApp["vault"]["getAbstractFileByPathInsensitive"]>;
}

/** Disabled/absent Core permits the ordinary unresolved fallback. */
export type CoreDailyRoute =
	| { kind: "none" }
	| { kind: "unavailable"; engine: "core-daily"; reason: "configuration" | "capability" | "folder" }
	| { kind: "ready"; snapshot: CoreDailyRouteSnapshot };

/** Discovery reads configuration and public folder state; it never calls the native creator. */
export function captureCoreDailyRoute(app: App): CoreDailyRoute {
	try {
		const nativeApp = app as CoreDailyApp;
		const wrapper = nativeApp.internalPlugins?.getPluginById?.("daily-notes");
		if (!wrapper || wrapper.enabled === false) return { kind: "none" };
		if (wrapper.enabled !== true) return { kind: "unavailable", engine: "core-daily", reason: "configuration" };
		const instance = wrapper.instance;
		const getFormat = instance?.getFormat, create = instance?.getDailyNote;
		const lookupInsensitive = nativeApp.vault.getAbstractFileByPathInsensitive;
		if (!instance || typeof getFormat !== "function" || typeof create !== "function" || typeof lookupInsensitive !== "function") {
			return { kind: "unavailable", engine: "core-daily", reason: "capability" };
		}
		const options = instance.options;
		if (!options || typeof options !== "object" || Array.isArray(options)) return { kind: "unavailable", engine: "core-daily", reason: "configuration" };
		const { format: configuredFormat, folder: configuredFolder, template: configuredTemplate } = options;
		if ((configuredFormat !== undefined && typeof configuredFormat !== "string") ||
			(configuredFolder !== undefined && typeof configuredFolder !== "string") ||
			(configuredTemplate !== undefined && typeof configuredTemplate !== "string")) {
			return { kind: "unavailable", engine: "core-daily", reason: "configuration" };
		}
		const format = getFormat.call(instance);
		if (typeof format !== "string" || !format) return { kind: "unavailable", engine: "core-daily", reason: "configuration" };
		const folder = configuredFolder ?? "", templatePath = configuredTemplate ?? "";
		const parent = folder ? app.vault.getAbstractFileByPath(normalizePath(folder)) : app.fileManager.getNewFileParent("");
		if (!(parent instanceof TFolder) || (app.vault.getRoot() !== parent && app.vault.getAbstractFileByPath(parent.path) !== parent)) {
			return { kind: "unavailable", engine: "core-daily", reason: "folder" };
		}
		return { kind: "ready", snapshot: {
			engine: "core-daily", granularity: "day", wrapper, instance, enabled: true,
			configuredFormat, configuredFolder, configuredTemplate, format, folder, templatePath,
			parent, parentPath: parent.path, parentPrefix: parent.isRoot() ? "" : `${parent.path}/`, getFormat, create, lookupInsensitive,
		} };
	} catch {
		return { kind: "unavailable", engine: "core-daily", reason: "configuration" };
	}
}

/** Core trims the title and always appends .md for lookup, including titles already ending in .md. */
export function coreDailyLinkpath(route: CoreDailyRouteSnapshot, date: moment.Moment): string {
	return route.parentPrefix + getCoreDailyTitle(route.format, date).title;
}

/** Compare native lookup and creation naming without reverse-parsing dates or implementing a filename engine. */
export function getCoreDailyTitle(format: string, date: moment.Moment): { title: string; compatible: boolean } {
	const title = date.format(format).trim();
	return { title, compatible: !!title && !title.toLowerCase().endsWith(".md") && normalizePath(title) === title };
}

function isFullPathMatch(file: TAbstractFile, path: string): boolean {
	return file.path.length === path.length && file.path.toLowerCase() === path.toLowerCase();
}

/** Public discovery is exact first, then metadata candidates with a strict full-path/live-file guard. */
export function lookupCoreDailyFile(app: App, route: CoreDailyRouteSnapshot, date: moment.Moment): TFile | null {
	const path = `${coreDailyLinkpath(route, date)}.md`;
	const exact = app.vault.getAbstractFileByPath(path);
	if (exact != null) return requireCoreDailyFile(app, exact, path);
	const candidate = app.metadataCache?.getFirstLinkpathDest?.(path, "");
	if (candidate instanceof TFile && isFullPathMatch(candidate, path) && app.vault.getAbstractFileByPath(candidate.path) === candidate) return candidate;
	requireCompatibleCoreTitle(route, date);
	return null;
}

/** Selection alone may perform the host's authoritative case-insensitive lookup, even before metadata is ready. */
export function recheckCoreDailyFile(app: App, route: CoreDailyRouteSnapshot, date: moment.Moment): TFile | null {
	const path = `${coreDailyLinkpath(route, date)}.md`;
	const file = app.vault.getAbstractFileByPath(path) ?? route.lookupInsensitive.call(app.vault, path);
	if (file != null) return requireCoreDailyFile(app, file, path);
	requireCompatibleCoreTitle(route, date);
	return null;
}

function requireCompatibleCoreTitle(route: CoreDailyRouteSnapshot, date: moment.Moment): void {
	if (!getCoreDailyTitle(route.format, date).compatible) {
		throw new Error("The Daily Notes format produces different lookup and creation paths. Use a nonblank title without an .md suffix or path normalization in Daily Notes settings.");
	}
}

function requireCoreDailyFile(app: App, file: TAbstractFile, path: string): TFile {
	if (!(file instanceof TFile) || !isFullPathMatch(file, path) || app.vault.getAbstractFileByPath(file.path) !== file) {
		throw new Error("The daily note path is occupied or did not resolve to a live vault file. Refresh the suggestions and retry.");
	}
	return file;
}

/** Delegate template/path behavior to the captured host method; the service validates the actual result. */
export function invokeCoreDailyNote(route: CoreDailyRouteSnapshot, date: moment.Moment): Promise<unknown> {
	return route.create.call(route.instance, date.clone());
}
