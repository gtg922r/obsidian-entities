import { Editor, EditorSuggestContext, EditorTransaction, MarkdownFileInfo, TFile, editorInfoField, App } from "obsidian";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { EditorBindings } from "../src/editorBindings";

/** Public Events-shaped fixture; dispatch is synchronous and retains actual callback arguments. */
export class TestEvents {
	listeners = new Map<string, Set<(...args: unknown[]) => void>>();
	on(name: string, callback: (...args: unknown[]) => void) {
		if (!this.listeners.has(name)) this.listeners.set(name, new Set());
		this.listeners.get(name)!.add(callback);
		return { emitter: this, name, callback };
	}
	offref(ref: { name: string; callback: (...args: unknown[]) => void }) { this.listeners.get(ref.name)?.delete(ref.callback); }
	trigger(name: string, ...args: unknown[]) { this.listeners.get(name)?.forEach(callback => callback(...args)); }
}

import { setEditorInfo } from "./editorInfoFixture";
const mounted: EditorView[] = [];
export function destroyTestEditors(): void { mounted.splice(0).forEach(view => { view.destroy(); view.dom.parentElement?.remove(); }); }

/** Real CodeMirror state/view/extension, with an Editor implementing the public transaction semantics. */
export function mountTestEditor(app: App, bindings: Pick<EditorBindings, "extension">, file: TFile, snapshot = "@", query = snapshot, providedEditor?: Editor) {
	const info = { app, file } as MarkdownFileInfo;
	const offset = (state: EditorState, pos: { line: number; ch: number }) => state.doc.line(pos.line + 1).from + pos.ch;
	const position = (state: EditorState, n: number) => { const line = state.doc.lineAt(n); return { line: line.number - 1, ch: n - line.from }; };
	const from = snapshot.indexOf(query);
	const editor = Object.assign(providedEditor ?? {}, {
		getValue: jest.fn(() => view.state.doc.toString()),
		getCursor: jest.fn((which: "head" | "anchor" = "head") => position(view.state, view.state.selection.main[which])),
		getLine: jest.fn((line: number) => view.state.doc.line(line + 1).text),
		listSelections: jest.fn(() => view.state.selection.ranges.map(range => ({ anchor: position(view.state, range.anchor), head: position(view.state, range.head) }))),
		posToOffset: jest.fn((pos: { line: number; ch: number }) => offset(view.state, pos)),
		offsetToPos: jest.fn((n: number) => position(view.state, n)),
		replaceRange: jest.fn(), setCursor: jest.fn(),
		transaction: jest.fn((transaction: EditorTransaction, origin?: string) => {
			const changes = view.state.changes(transaction.changes?.map(change => ({ from: offset(view.state, change.from), to: offset(view.state, change.to ?? change.from), insert: change.text })) ?? []);
			const next = EditorState.create({ doc: changes.apply(view.state.doc) });
			view.dispatch({ changes, selection: transaction.selection ? { anchor: offset(next, transaction.selection.from), head: offset(next, transaction.selection.to ?? transaction.selection.from) } : undefined, userEvent: origin });
		}),
	}) as jest.Mocked<Editor>;
	info.editor = editor;
	const parent = document.createElement("div"); document.body.appendChild(parent);
	const view = new EditorView({ parent, state: EditorState.create({ doc: snapshot, selection: { anchor: from + query.length }, extensions: [
		editorInfoField.init(() => info), bindings.extension,
		EditorView.updateListener.of(update => { if (update.docChanged) (app.workspace as unknown as TestEvents).trigger("editor-change", editor, info); }),
	] }) });
	mounted.push(view);
	app.workspace.activeEditor = info;
	const context: EditorSuggestContext = { editor, file, query, start: position(view.state, from + 1), end: position(view.state, from + query.length) };
	return { view, info, editor, context, setInfo: (next: MarkdownFileInfo | undefined) => view.dispatch({ effects: setEditorInfo.of(next) }) };
}
