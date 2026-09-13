import { StateEffect, StateField } from "@codemirror/state";
import type { MarkdownFileInfo } from "obsidian";

export const setEditorInfo = StateEffect.define<MarkdownFileInfo | undefined>();
export const editorInfoField = StateField.define<MarkdownFileInfo | undefined>({
	create: () => undefined,
	update: (value, transaction) => transaction.effects.reduce((info, effect) => effect.is(setEditorInfo) ? effect.value : info, value),
});
