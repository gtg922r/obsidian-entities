import { App, TFile } from "obsidian";
import { EntityFilter } from "../entities.types";

/** A compiled filter with its pre-built regex. */
export interface CompiledFilter extends EntityFilter {
	regex: RegExp;
}

/**
 * Compiles an array of EntityFilter definitions into CompiledFilters,
 * silently discarding any with invalid regex patterns.
 */
export function compileFilters(filters: EntityFilter[]): CompiledFilter[] {
	return filters
		.map((filter) => {
			try {
				return { ...filter, regex: new RegExp(filter.value, "i") };
			} catch (e) {
				console.error(`Invalid regex: ${filter.value}`, e);
				return null;
			}
		})
		.filter((filter): filter is CompiledFilter => filter !== null);
}

/**
 * Tests a single entity's frontmatter against all compiled filters (AND logic).
 * Returns true if the entity passes all filters.
 */
function matchesAllFilters(
	frontmatter: Record<string, unknown> | undefined,
	compiledFilters: CompiledFilter[]
): boolean {
	if (!frontmatter) return false;

	return compiledFilters.every((filter) => {
		const propertyValue = frontmatter[filter.property];
		if (!propertyValue) return filter.type === "exclude";

		const matches = filter.regex.test(String(propertyValue));
		return filter.type === "include" ? matches : !matches;
	});
}

/**
 * Applies entity filters to an array of TFiles using the app's metadata cache.
 * Returns the filtered array, or the original if no filters are configured.
 */
export function applyFiltersToFiles(
	files: TFile[],
	filters: EntityFilter[] | undefined,
	app: App
): TFile[] {
	if (!filters || filters.length === 0) {
		return files;
	}

	const compiledFilters = compileFilters(filters);

	return files.filter((file) => {
		const metadata = app.metadataCache.getFileCache(file);
		return matchesAllFilters(metadata?.frontmatter, compiledFilters);
	});
}

/**
 * Applies entity filters to Dataview query results using the app's metadata cache.
 * Each result must have a `file.path` property to look up metadata.
 */
export function applyFiltersToQueryResults<T extends { file: { path: string } }>(
	queryResults: T[],
	filters: EntityFilter[] | undefined,
	app: App
): T[] {
	if (!filters || filters.length === 0) {
		return queryResults;
	}

	const compiledFilters = compileFilters(filters);

	return queryResults.filter((entity) => {
		const abstractFile = app.vault.getAbstractFileByPath(entity.file.path);
		if (!(abstractFile instanceof TFile)) return false;
		const metadata = app.metadataCache.getFileCache(abstractFile);
		return matchesAllFilters(metadata?.frontmatter, compiledFilters);
	});
}
