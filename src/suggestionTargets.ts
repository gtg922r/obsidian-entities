import { TFile } from "obsidian";
import type { SuggestionTarget } from "./suggestion.types";

/** Validate and detach only the target wrapper, retaining host file/callback identity. */
export function readSuggestionTarget(value: unknown): SuggestionTarget {
	if (!value || typeof value !== "object") throw new Error("Missing suggestion target.");
	const target = value as Record<string, unknown>;
	const { kind, alias } = target;
	if (kind === "file" || kind === "unresolved-link") {
		if (alias !== undefined && typeof alias !== "string") throw new Error("Invalid target alias.");
		if (kind === "file" && target.file instanceof TFile && typeof target.file.path === "string") {
			return { kind, file: target.file, alias };
		}
		if (kind === "unresolved-link" && typeof target.linkpath === "string") {
			return { kind, linkpath: target.linkpath, alias };
		}
	} else if (kind === "text" && typeof target.text === "string") {
		return { kind, text: target.text };
	} else if (kind === "action" && typeof target.id === "string" && target.id.length && typeof target.callback === "function") {
		return { kind, id: target.id, callback: target.callback as Extract<SuggestionTarget, { kind: "action" }>["callback"] };
	}
	throw new Error("Invalid suggestion target.");
}

/** Native default aliases are equivalent; all other alias bytes are meaningful. */
export function effectiveAlias(alias: string | undefined): string | undefined {
	return alias === "" ? undefined : alias;
}

/** Attachments need a visible native Markdown label; Markdown notes use the native default. */
export function effectiveFileAlias(file: TFile, alias?: string): string | undefined {
	return effectiveAlias(alias) ?? (file.extension === "md" ? undefined : file.name);
}

/** Tuple encoding avoids collisions in paths, aliases and provider-defined operation IDs. */
export function suggestionTargetKey(target: SuggestionTarget, providerInstanceId: string, fileIds: Map<TFile, number>): string {
	switch (target.kind) {
		case "file":
			// Object identity also separates deleted/recreated files with the same path.
			if (!fileIds.has(target.file)) fileIds.set(target.file, fileIds.size);
			return JSON.stringify([target.kind, fileIds.get(target.file), effectiveFileAlias(target.file, target.alias)]);
		case "unresolved-link":
			return JSON.stringify([target.kind, target.linkpath, effectiveAlias(target.alias)]);
		case "text":
			return JSON.stringify([target.kind, target.text]);
		case "action":
			return JSON.stringify([target.kind, providerInstanceId, target.id]);
	}
}

/** Deliberate unresolved date links retain explicit wikilinks until the R4 outcome contract. */
export function unresolvedWikilink(linkpath: string, alias?: string): string {
	return `[[${linkpath}${effectiveAlias(alias) === undefined ? "" : `|${alias}`}]]`;
}
