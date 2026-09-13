import type { EditorSuggestContext, SearchResult, TFile } from "obsidian";

/** One insertion meaning, independent of the label used to find and recognize it. */
export type SuggestionTarget =
	| { kind: "file"; file: TFile; alias?: string }
	| { kind: "unresolved-link"; linkpath: string; alias?: string }
	| { kind: "text"; text: string }
	| { kind: "action"; id: string; callback: SuggestionAction };

/** Existing callbacks own their side effects and may return the exact insertion text. */
export type SuggestionAction = (
	item: EntitySuggestionItem,
	context: EditorSuggestContext | null
) => Promise<string | void> | string | void;

/** Searchable presentation paired with a required, unambiguous target. */
export interface EntitySuggestionItem {
	suggestionText: string;
	target: SuggestionTarget;
	icon?: string;
	flair?: string;
	noteText?: string;
	match?: SearchResult;
}
