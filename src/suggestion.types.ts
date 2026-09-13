import type { SearchResult, TFile } from "obsidian";
import type { CreationResult } from "./entityCreation";

/** One insertion meaning, independent of the label used to find and recognize it. */
export type NonActionTarget =
	| { kind: "file"; file: TFile; alias?: string }
	| { kind: "unresolved-link"; linkpath: string; alias?: string }
	| { kind: "text"; text: string };

/** Actions return meaning; the coordinator alone owns editor insertion. */
export type SuggestionTarget = NonActionTarget | { kind: "action"; id: string; callback: SuggestionAction };

/** UTF-16 offsets copied from all source selections. */
export interface CapturedSelection {
	readonly anchor: number;
	readonly head: number;
}

/** Immutable input; native file identity is retained, never frozen or cloned. */
export interface ActionContext {
	readonly source: { readonly file: TFile; readonly path: string };
	readonly snapshot: string;
	readonly trigger: { readonly from: number; readonly to: number; readonly text: string; readonly query: string };
	readonly selections: readonly CapturedSelection[];
	/** Recheck immediately before engine startup after an await. */
	readonly canStartWork: () => boolean;
}

/** One replacement in the captured document; cursor addresses the resulting document. */
export interface ActionEdit {
	readonly from: number;
	readonly to: number;
	readonly text: string;
	readonly cursor: number;
}

/** Creation status survives a later refusal to insert its link. */
export type ActionResult =
	| (Extract<CreationResult, { status: "created" | "existing" }> & { readonly alias?: string })
	| Exclude<CreationResult, { status: "created" | "existing" }>
	| { status: "target"; target: NonActionTarget }
	| { status: "edit"; edit: ActionEdit }
	| { status: "unavailable"; message: string };

/** Discovery stays synchronous; only selected actions may start asynchronous work. */
export type SuggestionAction = (context: ActionContext) => ActionResult | Promise<ActionResult>;

/** Searchable presentation paired with a required, unambiguous target. */
export interface EntitySuggestionItem {
	suggestionText: string;
	target: SuggestionTarget;
	icon?: string;
	flair?: string;
	noteText?: string;
	match?: SearchResult;
}
