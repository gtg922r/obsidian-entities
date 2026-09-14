import { App, parseFrontMatterAliases, parseFrontMatterStringArray, TFile } from "obsidian";
import { EntitySuggestionItem } from "../suggestion.types";
import { ownFrontmatterValue } from "./EntityFilters";

/** Both providers use raw cached frontmatter; legacy unsupported selectors remain untouched. */
export interface FileAliasSettings {
	shouldCreateEntitiesForAliases?: boolean;
	propertyToCreateEntitiesFor?: string;
}

/** Unsupported legacy selectors disable only custom aliases, not base/native entries. */
export function aliasSelectorError(selector: unknown): string | undefined {
	return selector === undefined || typeof selector === "string"
		? undefined : "Unsupported frontmatter alias property — custom aliases unavailable; enter a property to replace this value";
}

/** Expand aliases through public host parsers, leaving semantic deduplication to the suggestor. */
export function fileAliasSuggestions(file: TFile, app: App, settings: FileAliasSettings, icon: string): EntitySuggestionItem[] {
	const frontmatter: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) return [];
	const aliases = settings.shouldCreateEntitiesForAliases ? parseFrontMatterAliases(frontmatter) ?? [] : [];
	const key: unknown = settings.propertyToCreateEntitiesFor;
	if (typeof key === "string" && key !== "" && ownFrontmatterValue(frontmatter, key) !== undefined) {
		// A one-key object preserves exact casing and blocks inherited/path interpretation.
		aliases.push(...(parseFrontMatterStringArray({ [key]: ownFrontmatterValue(frontmatter, key) }, key) ?? []));
	}
	return aliases.filter(alias => typeof alias === "string" && alias.trim() !== "").map(alias => ({
		suggestionText: alias.trim(), icon, target: { kind: "file", file, alias: alias.trim() },
	}));
}
