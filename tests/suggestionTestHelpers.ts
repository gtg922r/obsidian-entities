import type { TFile } from "obsidian";
import type { ActionContext } from "../src/suggestion.types";
import { EntitySuggestionItem } from "../src/suggestion.types";

/** Narrow the action target for focused provider outcome tests. */
export const getAction = (item: EntitySuggestionItem | undefined) => item?.target.kind === "action" ? item.target.callback : undefined;

/** Provider-only fixture; coordinator tests supply a real captured editor context separately. */
export function actionContext(file = { path: "Writing/Source.md" } as TFile, snapshot = "@", query = snapshot): ActionContext {
	const from = snapshot.indexOf(query);
	return { source: { file, path: file.path }, snapshot, trigger: { from, to: from + query.length, text: query, query },
		selections: [{ anchor: snapshot.length, head: snapshot.length }], canStartWork: () => true };
}
