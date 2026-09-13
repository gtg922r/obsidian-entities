import { EntitySuggestionItem } from "../src/suggestion.types";

/** Narrow the union in legacy callback behavior tests. */
export const getAction = (item: EntitySuggestionItem | undefined) => item?.target.kind === "action" ? item.target.callback : undefined;
