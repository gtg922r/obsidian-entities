import { App, TFile, moment } from "obsidian";
import { AppWithPlugins, PeriodicNotesGranularity } from "./entities.types";
import { CoreDailyRoute, CoreDailyRouteSnapshot, captureCoreDailyRoute, coreDailyLinkpath, getCoreDailyTitle, lookupCoreDailyFile } from "./coreDailyNotes";
import { PeriodicRouteSnapshot, capturePeriodicRoute, getPeriodicLookupDate, lookupPeriodicFile, periodicLinkpath } from "./periodicNotes";

/** Keep the beta calendar contract distinct from Core's native daily destination. */
export type DateRouteSnapshot =
	| (PeriodicRouteSnapshot & { readonly engine: "beta-calendar" })
	| CoreDailyRouteSnapshot;

/** A known inactive route permits fallback; an unrecognized configuration does not. */
export type DateRoute =
	| { kind: "none" }
	| Extract<CoreDailyRoute, { kind: "unavailable" }>
	| { kind: "unavailable"; engine: "periodic-notes"; reason: "configuration" | "flat-active" }
	| { kind: "ready"; snapshot: DateRouteSnapshot };

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

const flatGranularities = { day: "daily", week: "weekly", month: "monthly", quarter: "quarterly", year: "yearly" } as const;

/** Recognition only establishes flat inactivity; it never supplies lookup or creation. */
function isCompleteFlatSettings(settings: unknown): settings is Record<string, { enabled?: boolean }> {
	return isRecord(settings) && !("subscribe" in settings) && !("calendarSets" in settings) && !("activeCalendarSet" in settings) &&
		Object.values(flatGranularities).every(key => {
			const config = settings[key];
			return isRecord(config) && ["format", "folder", "template"].every(field => typeof config[field] === "string") &&
				(!("enabled" in config) || typeof config.enabled === "boolean");
		});
}

/** Choose one destination per used granularity, preserving active beta priority and weekly isolation. */
export function captureDateRoute(app: App, granularity: PeriodicNotesGranularity): DateRoute {
	try {
		const plugin: unknown = (app as AppWithPlugins).plugins?.getPlugin?.("periodic-notes");
		if (plugin != null) {
			if (!isRecord(plugin)) return { kind: "unavailable", engine: "periodic-notes", reason: "configuration" };
			if ("calendarSetManager" in plugin) {
				// A partial manager or a hybrid flat/calendar shape cannot authorize another engine.
				const settings = plugin.settings;
				if (isRecord(settings) && Object.values(flatGranularities).some(key => key in settings)) {
					return { kind: "unavailable", engine: "periodic-notes", reason: "configuration" };
				}
				const beta = capturePeriodicRoute(app, granularity);
				if (beta.kind === "ready") return { kind: "ready", snapshot: { ...beta.snapshot, engine: "beta-calendar" } };
				if (beta.kind === "unavailable") return { kind: "unavailable", engine: "periodic-notes", reason: "configuration" };
			} else {
				if ("getPeriodicNote" in plugin || "createPeriodicNote" in plugin || !isCompleteFlatSettings(plugin.settings)) {
					return { kind: "unavailable", engine: "periodic-notes", reason: "configuration" };
				}
				if (plugin.settings[flatGranularities[granularity]].enabled === true) return { kind: "unavailable", engine: "periodic-notes", reason: "flat-active" };
			}
		}
		return granularity === "day" ? captureCoreDailyRoute(app) : { kind: "none" };
	} catch {
		return { kind: "unavailable", engine: "periodic-notes", reason: "configuration" };
	}
}

/** Compare captured primitive values and native identities, including the resolved default parent. */
export function matchesDateRoute(expected: DateRouteSnapshot, current: DateRoute): boolean {
	return current.kind === "ready" && expected.engine === current.snapshot.engine &&
		Object.entries(expected).every(([key, value]) => value === (current.snapshot as unknown as Record<string, unknown>)[key]);
}

/** The intentional unresolved destination follows the selected engine's filename semantics. */
export function dateLinkpath(route: DateRouteSnapshot, date: moment.Moment): string {
	return route.engine === "core-daily" ? coreDailyLinkpath(route, date) : periodicLinkpath(route, date);
}

/** Synchronous discovery never invokes Core creation or its full-map case-insensitive lookup. */
export function lookupDateFile(app: App, route: DateRouteSnapshot, date: moment.Moment): TFile | null {
	return route.engine === "core-daily" ? lookupCoreDailyFile(app, route, date) : lookupPeriodicFile(app, route, date);
}

/** Neutral current-title data for settings; each engine retains its own format limitation. */
export function getDateRouteStatus(route: DateRoute, date: moment.Moment):
	| Exclude<DateRoute, { kind: "ready" }>
	| { kind: "ready"; engine: DateRouteSnapshot["engine"]; limitation?: { reason: "date-identity" | "title-path"; granularity: PeriodicNotesGranularity; format: string; title: string } } {
	if (route.kind !== "ready") return route;
	const snapshot = route.snapshot;
	if (snapshot.engine === "core-daily") {
		const { title, compatible } = getCoreDailyTitle(snapshot.format, date);
		return { kind: "ready", engine: snapshot.engine, ...(!compatible ?
			{ limitation: { reason: "title-path" as const, granularity: snapshot.granularity, format: snapshot.format, title } } : {}) };
	}
	return { kind: "ready", engine: snapshot.engine,
		...(!getPeriodicLookupDate(snapshot.format, date) ?
			{ limitation: { reason: "date-identity" as const, granularity: snapshot.granularity, format: snapshot.format, title: date.format(snapshot.format) } } : {}),
	};
}
