import { App, TFile } from "obsidian";
import { EntityFilter } from "../entities.types";

/** An active filter with its case-insensitive regex. */
export interface CompiledFilter extends EntityFilter {
	regex: RegExp;
}

/** Shared runtime/editor classification; incomplete rows impose no constraint. */
export type FilterClassification =
	| { status: "active"; filter: CompiledFilter }
	| { status: "inactive"; message: string }
	| { status: "invalid"; message: string; malformed: boolean };

/** A configuration error blocks ordinary results, without discarding saved rows. */
export interface FilterCompilation {
	filters: CompiledFilter[];
	error?: string;
}

/** Read a literal own frontmatter key without interpreting paths or inherited members. */
export function ownFrontmatterValue(frontmatter: unknown, property: string): unknown {
	if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) return undefined;
	return Object.prototype.hasOwnProperty.call(frontmatter, property)
		? (frontmatter as Record<string, unknown>)[property] : undefined;
}

/** Classify shape before inactivity, then compile the exact pattern used at runtime. */
export function classifyFilter(value: unknown): FilterClassification {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return { status: "invalid", malformed: true, message: "Invalid filter row — no file suggestions" };
	}
	const filter = value as Partial<EntityFilter>;
	if ((filter.type !== "include" && filter.type !== "exclude") || typeof filter.property !== "string" || typeof filter.value !== "string") {
		return { status: "invalid", malformed: true, message: "Invalid filter row — no file suggestions" };
	}
	if (filter.property === "" || filter.value === "") {
		return { status: "inactive", message: "Inactive filter — enter a frontmatter property and regex" };
	}
	try {
		return { status: "active", filter: { ...filter as EntityFilter, regex: new RegExp(filter.value, "i") } };
	} catch {
		return { status: "invalid", malformed: false, message: "Invalid regex — no file suggestions" };
	}
}

/** Compile once per evaluation; never silently remove an invalid active constraint. */
export function compileFilters(filters: unknown): FilterCompilation {
	if (filters === undefined) return { filters: [] };
	if (!Array.isArray(filters)) return { filters: [], error: "Invalid filter collection — no file suggestions" };
	const compiled: CompiledFilter[] = [];
	for (const row of filters) {
		const result = classifyFilter(row);
		if (result.status === "invalid") return { filters: [], error: result.message };
		if (result.status === "active") compiled.push(result.filter);
	}
	return { filters: compiled };
}

function scalarValues(value: unknown): string[] {
	const values = Array.isArray(value) ? value : [value];
	return values.flatMap(member => {
		if (typeof member === "string") return [member];
		if (typeof member === "boolean" || (typeof member === "number" && Number.isFinite(member))) return [String(member)];
		return [];
	});
}

/** Apply AND across rows, ANY value for include and NONE for exclude, before aliases. */
export function applyCompiledFiltersToFiles(files: TFile[], compiled: FilterCompilation, app: App): TFile[] {
	if (compiled.error) return [];
	if (compiled.filters.length === 0) return files;
	return files.filter(file => {
		const frontmatter: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
		return compiled.filters.every(filter => {
			const matches = scalarValues(ownFrontmatterValue(frontmatter, filter.property)).some(value => filter.regex.test(value));
			return filter.type === "include" ? matches : !matches;
		});
	});
}

/** Compile and apply raw settings to real candidate files. */
export function applyFiltersToFiles(files: TFile[], filters: unknown, app: App): TFile[] {
	return applyCompiledFiltersToFiles(files, compileFilters(filters), app);
}
