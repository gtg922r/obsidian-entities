import { App, normalizePath, moment } from "obsidian";
import { AppWithPlugins, PeriodicNotesCalendarSetManager, PeriodicNotesGranularity, PeriodicNotesPlugin } from "./entities.types";

/** Copied effective destination and native identities, never a retained mutable config. */
export interface PeriodicRouteSnapshot {
	readonly plugin: PeriodicNotesPlugin;
	readonly manager: PeriodicNotesCalendarSetManager;
	readonly granularity: PeriodicNotesGranularity;
	readonly activeId: string;
	readonly enabled: true;
	readonly format: string;
	readonly folder: string;
	readonly templatePath: string;
	readonly getActiveId: PeriodicNotesCalendarSetManager["getActiveId"];
	readonly getActiveConfig: PeriodicNotesCalendarSetManager["getActiveConfig"];
	readonly getActiveGranularities: PeriodicNotesCalendarSetManager["getActiveGranularities"];
	readonly getFormat: PeriodicNotesCalendarSetManager["getFormat"];
	readonly lookup: NonNullable<PeriodicNotesPlugin["getPeriodicNote"]>;
	readonly create: PeriodicNotesPlugin["createPeriodicNote"];
}

/** Absence/inactivity permits fallback; unknown active configuration does not. */
export type PeriodicRoute =
	| { kind: "none" }
	| { kind: "unavailable" }
	| { kind: "ready"; snapshot: PeriodicRouteSnapshot };

/** Read each used granularity once per evaluation; native getters retain their receiver. */
export function capturePeriodicRoute(app: App, granularity: PeriodicNotesGranularity): PeriodicRoute {
	try {
		const plugin = (app as AppWithPlugins).plugins?.getPlugin?.("periodic-notes") as PeriodicNotesPlugin | undefined;
		if (plugin == null) return { kind: "none" };
		const manager = plugin.calendarSetManager;
		if (!manager) return { kind: "unavailable" };
		const { getActiveId, getActiveConfig, getActiveGranularities, getFormat } = manager;
		if ([getActiveId, getActiveConfig, getActiveGranularities, getFormat].some(method => typeof method !== "function")) return { kind: "unavailable" };
		const activeId = getActiveId.call(manager);
		const active = getActiveGranularities.call(manager);
		const config = getActiveConfig.call(manager, granularity);
		if (typeof activeId !== "string" || !activeId || !Array.isArray(active) ||
			active.some(value => !["day", "week", "month", "quarter", "year"].includes(value)) ||
			!config || typeof config !== "object") return { kind: "unavailable" };
		const { enabled: configuredEnabled } = config;
		if (typeof configuredEnabled !== "boolean") return { kind: "unavailable" };
		const enabled = active.includes(granularity);
		if (enabled !== configuredEnabled) return { kind: "unavailable" };
		if (!enabled) return { kind: "none" };
		const { format: configuredFormat, folder = "", templatePath = "" } = config;
		const format = getFormat.call(manager, granularity);
		const { getPeriodicNote: lookup, createPeriodicNote: creationMethod } = plugin;
		const create = typeof creationMethod === "function" ? creationMethod : undefined;
		if ((configuredFormat !== undefined && typeof configuredFormat !== "string") ||
			typeof format !== "string" || !format || typeof folder !== "string" || typeof templatePath !== "string" ||
			typeof lookup !== "function") return { kind: "unavailable" };
		return { kind: "ready", snapshot: { plugin, manager, granularity, activeId, enabled: true, format, folder, templatePath,
			getActiveId, getActiveConfig, getActiveGranularities, getFormat, lookup, create } };
	} catch {
		return { kind: "unavailable" };
	}
}

/** Compare primitives and identities, including in-place native config or method changes. */
export function matchesPeriodicRoute(expected: PeriodicRouteSnapshot, current: PeriodicRoute): boolean {
	return current.kind === "ready" && (Object.keys(expected) as (keyof PeriodicRouteSnapshot)[])
		.every(key => expected[key] === current.snapshot[key]);
}

/** Mirror beta's slash join and .md suffix handling without trimming literal spaces. */
export function periodicLinkpath(route: PeriodicRouteSnapshot, date: moment.Moment): string {
	const title = date.format(route.format);
	const name = title.endsWith(".md") ? title : `${title}.md`;
	const path = normalizePath(`${route.folder}/${name}`.split("/").filter(part => part && part !== ".").join("/"));
	return path.endsWith(".md") ? path.slice(0, -3) : path;
}
