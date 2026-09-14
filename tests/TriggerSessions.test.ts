import { App, EditorSuggestContext, Plugin, TFile } from "obsidian";
import { Compartment, StateEffect } from "@codemirror/state";
import * as language from "@codemirror/language";
import Entities from "../src/main";
import { EntitiesSuggestor } from "../src/EntitiesSuggestor";
import { EditorBindings } from "../src/editorBindings";
import ProviderRegistry from "../src/Providers/ProviderRegistry";
import { destroyTestEditors, mountTestEditor, TestEvents } from "./editorTestHarness";
import { pressScopeKey } from "./__mocks__/obsidian";
import { NativeNode, replayLanguage } from "./nativeSyntaxFixture";

jest.mock("obsidian", () => {
	const mock = jest.requireActual("./__mocks__/obsidian");
	return { ...mock,
		EditorSuggest: class {
			context: EditorSuggestContext | null = null;
			scope = new mock.Scope();
			constructor() { this.scope.register([], "Escape", () => { this.close(); return false; }); }
			close() { this.context = null; }
		},
		prepareFuzzySearch: () => () => ({ score: 10, matches: [] }),
		Notice: jest.fn(),
	};
});
jest.mock("../src/userComponents", () => ({}));

function setup(doc = "@Bob", records: (doc: string) => NativeNode[] = () => []) {
	const workspace = new TestEvents(), vault = new TestEvents(), files = new Map<string, TFile>();
	const app = { workspace, vault: Object.assign(vault, { getAbstractFileByPath: (path: string) => files.get(path) }) } as unknown as App;
	const file = Object.assign(new TFile(), { path: "Writing.md" }); files.set(file.path, file);
	const bindings = new EditorBindings(app), syntax = new Compartment();
	bindings.register({ registerEditorExtension() {}, register() {}, registerEvent() {} } as unknown as Plugin);
	let changed = () => {};
	const provider = { providerInstanceId: "one", isQueryDependent: true, getRefreshBehavior: () => 0,
		getEntityList: jest.fn(() => [{ suggestionText: "Bob", target: { kind: "text", text: "Alice" } }]), getTemplateCreationSuggestions: () => [] };
	const registry = { revision: 1, onChange: (callback: () => void) => { changed = callback; return () => {}; }, getProviders: () => [provider], getProvidersForTrigger: () => [provider] } as unknown as ProviderRegistry;
	const suggestor = new EntitiesSuggestor({ app } as Entities, registry, bindings);
	const mounted = mountTestEditor(app, bindings, file, doc, doc, undefined, syntax.of(replayLanguage(records)));
	const trigger = () => suggestor.onTrigger(mounted.editor.getCursor(), mounted.editor, file);
	const show = () => {
		const candidate = trigger(); expect(candidate).not.toBeNull();
		suggestor.context = { ...candidate!, editor: mounted.editor, file };
		return suggestor.getSuggestions(suggestor.context);
	};
	const escape = (composing = false) => pressScopeKey(suggestor.scope, "Escape", composing);
	const append = (text: string) => { const to = mounted.view.state.doc.length; mounted.view.dispatch({ changes: { from: to, insert: text }, selection: { anchor: to + text.length } }); };
	return { app, workspace, vault, files, file, bindings, syntax, registry, provider, suggestor, ...mounted, trigger, show, escape, append, changed: () => changed() };
}

afterEach(() => { destroyTestEditors(); jest.restoreAllMocks(); });

test("only deliberate non-composing Escape dismisses the current phrase through typing and data invalidation", () => {
	const r = setup(); r.show(); r.escape();
	expect(r.suggestor.context).toBeNull();
	r.append(" Hope"); r.suggestor.invalidateData();
	expect(r.trigger()).toBeNull();
});

test.each(["close", "empty", "success"])("%s never creates Escape dismissal, including native close-before-selection", reason => {
	const r = setup();
	if (reason === "empty") r.provider.getEntityList.mockReturnValue([]);
	const items = r.show(); r.suggestor.close();
	if (reason === "success") {
		r.suggestor.selectSuggestion(items[0], {} as MouseEvent);
		expect(r.editor.getValue()).toBe("Alice");
		r.view.dispatch({ changes: { from: 0, to: 5, insert: "@Bob" }, selection: { anchor: 4 } });
	}
	expect(r.trigger()?.query).toBe("@Bob");
});

test("empty results followed by Escape do not dismiss", () => {
	const r = setup(); r.provider.getEntityList.mockReturnValue([]); r.show(); r.escape();
	expect(r.trigger()).not.toBeNull();
});

test("Escape before any eligible/displayed request does not fabricate a session", () => {
	const r = setup(); r.escape(); expect(r.trigger()).not.toBeNull();
	r.suggestor.context = { editor: r.editor, file: r.file, start: { line: 0, ch: 1 }, end: { line: 0, ch: 4 }, query: "@Bob" };
	r.escape(); expect(r.trigger()).not.toBeNull();
});

test.each(["event", "view"])("composing Escape from %s preserves context and a later ordinary Escape works", source => {
	const r = setup(); const [item] = r.show();
	if (source === "view") Object.defineProperty(r.view, "composing", { configurable: true, value: true });
	expect(r.escape(source === "event")).toBeUndefined();
	expect(r.suggestor.context).not.toBeNull();
	r.suggestor.selectSuggestion(item, new KeyboardEvent("keydown", { key: "Enter", isComposing: true }));
	expect(r.editor.transaction).not.toHaveBeenCalled();
	if (source === "view") Object.defineProperty(r.view, "composing", { configurable: true, value: false });
	r.escape(); expect(r.trigger()).toBeNull();
});

test.each(["delete", "replace", "leave", "newest-invalid", "replace-same-mark", "select-range"])("%s ends the dismissed session even without an intervening onTrigger", reason => {
	const r = setup(); r.show(); r.escape();
	if (reason === "delete") { r.view.dispatch({ changes: { from: 0, to: 1 } }); r.view.dispatch({ changes: { from: 0, insert: "@" }, selection: { anchor: 4 } }); }
	if (reason === "replace") r.view.dispatch({ changes: { from: 0, to: 1, insert: ":" }, selection: { anchor: 4 } });
	if (reason === "leave") { r.view.dispatch({ selection: { anchor: 0 } }); r.view.dispatch({ selection: { anchor: 4 } }); }
	if (reason === "newest-invalid") { r.append(" /usr/local"); r.view.dispatch({ changes: { from: 4, to: r.view.state.doc.length }, selection: { anchor: 4 } }); }
	if (reason === "replace-same-mark") r.view.dispatch({ changes: { from: 0, to: 1, insert: "@" } });
	if (reason === "select-range") { r.view.dispatch({ selection: { anchor: 1, head: 4 } }); r.view.dispatch({ selection: { anchor: 4 } }); }
	expect(r.trigger()).not.toBeNull();
});

test("ordinary typing does not depend on onTrigger being called to retain dismissal", () => {
	const r = setup(); r.show(); r.escape(); r.append(" Hope"); r.append(" family"); expect(r.trigger()).toBeNull();
});

test.each(["file-open", "active-leaf-change", "registry"])("%s clears dismissal", event => {
	const r = setup(); r.show(); r.escape();
	if (event === "registry") r.changed(); else r.workspace.trigger(event);
	expect(r.trigger()).not.toBeNull();
});

test.each([false, true])("different editors at identical coordinates do not share dismissal (same file: %s)", sameFile => {
	const r = setup(); r.show(); r.escape();
	const file = sameFile ? r.file : Object.assign(new TFile(), { path: "Other.md" });
	const second = mountTestEditor(r.app, r.bindings, file, "@Bob");
	expect(r.suggestor.onTrigger(second.editor.getCursor(), second.editor, file)).not.toBeNull();
});

test("destroyed/superseded binding cannot be revived by stale view update or focus", () => {
	const r = setup(); r.show(); r.escape();
	const second = mountTestEditor(r.app, r.bindings, r.file, "@Bob", "@Bob", r.editor);
	r.view.dispatch({ effects: StateEffect.appendConfig.of([]) });
	r.view.contentDOM.dispatchEvent(new FocusEvent("focus"));
	expect(r.suggestor.onTrigger(second.editor.getCursor(), second.editor, r.file)).not.toBeNull();
	second.view.destroy(); r.view.dispatch({ effects: StateEffect.appendConfig.of([]) });
	r.app.workspace.activeEditor = r.info;
	expect(r.suggestor.onTrigger({ line: 0, ch: 4 }, r.editor, r.file)).toBeNull();
});

test.each(["window-close", "delete", "rename", "detach", "dispose", "missing-info"])("%s prevents stale eligibility and Escape", event => {
	const r = setup(); r.show();
	if (event === "window-close") r.workspace.trigger(event, null, r.view.dom.ownerDocument.defaultView);
	if (event === "delete" || event === "rename") r.vault.trigger(event, r.file);
	if (event === "detach") r.view.dom.remove();
	if (event === "dispose") r.suggestor.dispose();
	if (event === "missing-info") r.setInfo(undefined);
	r.escape(); expect(r.trigger()).toBeNull();
});

test("replacement public file info establishes a fresh session", () => {
	const r = setup(); r.show(); r.escape();
	const file = Object.assign(new TFile(), { path: "Replacement.md" }), info = { ...r.info, file };
	r.setInfo(info); r.app.workspace.activeEditor = info;
	expect(r.suggestor.onTrigger(r.editor.getCursor(), r.editor, file)).not.toBeNull();
});

test("missing/incomplete syntax quietly retries; temporary unavailability preserves an existing dismissal", () => {
	const r = setup(); r.show();
	r.view.dispatch({ effects: r.syntax.reconfigure([]) });
	expect(r.trigger()).toBeNull(); r.escape();
	r.view.dispatch({ effects: r.syntax.reconfigure(replayLanguage()) });
	expect(r.trigger()).not.toBeNull(); r.show(); r.escape();
	r.view.dispatch({ effects: r.syntax.reconfigure([]) }); expect(r.trigger()).toBeNull();
	r.view.dispatch({ effects: r.syntax.reconfigure(replayLanguage()) }); expect(r.trigger()).toBeNull();
});

test("syntax exceptions and false availability cannot reuse old eligibility or create dismissal", () => {
	const r = setup(); r.show();
	jest.spyOn(language, "syntaxTreeAvailable").mockReturnValueOnce(false);
	expect(r.trigger()).toBeNull(); r.escape(); expect(r.trigger()).not.toBeNull();
	r.show(); jest.spyOn(language, "syntaxTree").mockImplementationOnce(() => { throw new Error("unavailable"); });
	r.escape(); expect(r.trigger()).not.toBeNull();
});

test("mismatched editor text, cursor, file and stale displayed query fail quiet then retry", () => {
	const r = setup(); r.show();
	r.editor.getLine.mockReturnValueOnce("other text"); expect(r.trigger()).toBeNull(); r.escape(); expect(r.trigger()).not.toBeNull();
	expect(r.suggestor.onTrigger({ line: 0, ch: 999 }, r.editor, r.file)).toBeNull();
	expect(r.suggestor.onTrigger({ line: 0, ch: 1 }, r.editor, r.file)).toBeNull();
	expect(r.suggestor.onTrigger(r.editor.getCursor(), r.editor, new TFile())).toBeNull();
	r.show(); r.append(" Hope"); r.escape(); expect(r.trigger()).not.toBeNull();
});

test("unsaved fence edits use the current tree and known blocked context ends dismissal", () => {
	const r = setup("@Bob", doc => doc.startsWith("```") ? [{ name: "HyperMD-codeblock", from: 4, to: doc.length, kind: "line" }] : []);
	r.show(); r.escape();
	r.view.dispatch({ changes: { from: 0, insert: "```\n" }, selection: { anchor: 8 } }); expect(r.trigger()).toBeNull();
	r.view.dispatch({ changes: { from: 0, to: 4 }, selection: { anchor: 4 } }); expect(r.trigger()).not.toBeNull();
});

test("background data invalidation leaves the visible row selectable", () => {
	const r = setup(); const [item] = r.show(); r.suggestor.invalidateData();
	r.suggestor.selectSuggestion(item, {} as MouseEvent);
	expect(r.editor.getValue()).toBe("Alice");
});

test("creation cancellation after native close-before-selection allows the same slash phrase to reopen", async () => {
	const r = setup("/Person");
	let cancel!: (value: { status: "cancelled" }) => void;
	const callback = jest.fn(() => new Promise(resolve => { cancel = resolve; }));
	r.provider.getEntityList.mockReturnValue([{ suggestionText: "Person", target: { kind: "action", id: "create-person", callback } }] as any);
	const [item] = r.show(); r.suggestor.close();
	r.suggestor.selectSuggestion(item, new KeyboardEvent("keydown", { key: "Enter" }));
	// The name modal owns this cancellation; it does not dispatch Escape to the closed suggestion scope.
	cancel({ status: "cancelled" }); await Promise.resolve();
	expect(r.editor.getValue()).toBe("/Person");
	r.view.dispatch({ changes: { from: 6, to: 7, insert: "n" }, selection: { anchor: 7 } });
	expect(r.trigger()?.query).toBe("/Person");
	expect(callback).toHaveBeenCalledTimes(1);
});

test("stale editor offsets cannot borrow a matching line from a different state", () => {
	const r = setup("prefix\n@Bob");
	r.editor.posToOffset.mockReturnValueOnce(0);
	expect(r.trigger()).toBeNull(); expect(r.trigger()?.query).toBe("@Bob");
});

test("no active-editor fallback when the supplied editor has no binding", () => {
	const r = setup();
	expect(r.suggestor.onTrigger({ line: 0, ch: 4 }, { getLine: () => "@Bob" } as any, r.file)).toBeNull();
	expect(r.trigger()).not.toBeNull();
});

test("syntax-only native updates do not request a popup", () => {
	const r = setup(); r.show(); r.escape();
	const request = jest.spyOn(r.suggestor, "onTrigger");
	r.view.dispatch({ effects: r.syntax.reconfigure(replayLanguage()) });
	expect(request).not.toHaveBeenCalled();
	expect(r.trigger()).toBeNull();
});


test("closing an unsaved fence makes following prose eligible on the next request", () => {
	const cases: { name: string; doc: string; nodes: NativeNode[] }[] = require("./fixtures/native-syntax.json").cases;
	const open = cases.find(item => item.name === "fence-open")!, closed = cases.find(item => item.name === "fence")!;
	const r = setup(open.doc, doc => cases.find(item => item.doc === doc)!.nodes);
	expect(r.trigger()).toBeNull();
	r.view.dispatch({ changes: { from: 0, to: open.doc.length, insert: closed.doc }, selection: { anchor: closed.doc.length } });
	expect(r.trigger()?.query).toBe("@Alice");
});

test("composing Escape preserves a visible menu after its trigger becomes ineligible before native close", () => {
	const r = setup(":cat"); r.show();
	const context = r.suggestor.context;
	Object.defineProperty(r.view, "composing", { configurable: true, value: true });
	r.append(" "); // Existing ViewPlugin invalidates the trigger before the host's delayed menu request.
	const close = jest.spyOn(r.suggestor, "close");
	expect(r.escape()).toBeUndefined(); // The Escape event itself need not report composition.
	expect(close).not.toHaveBeenCalled();
	expect(r.suggestor.context).toBe(context);
	Object.defineProperty(r.view, "composing", { configurable: true, value: false });
	r.view.dispatch({ changes: { from: 4, to: 5 }, selection: { anchor: 4 } });
	expect(r.trigger()?.query).toBe(":cat");
});

test.each(["activation", "superseded", "missing-info", "detach"])("a stale displayed context after %s does not consume unrelated Escape", reason => {
	const r = setup(":cat"); r.show();
	Object.defineProperty(r.view, "composing", { configurable: true, value: true });
	if (reason === "activation") r.workspace.trigger("active-leaf-change");
	if (reason === "superseded") {
		const second = mountTestEditor(r.app, r.bindings, r.file, ":cat", ":cat", r.editor);
		Object.defineProperty(second.view, "composing", { configurable: true, value: true });
		r.view.dispatch({ effects: StateEffect.appendConfig.of([]) });
		r.view.contentDOM.dispatchEvent(new FocusEvent("focus"));
	}
	if (reason === "missing-info") r.setInfo(undefined);
	if (reason === "detach") r.view.dom.remove();
	expect(r.escape()).toBeUndefined();
	expect(r.suggestor.context).toBeNull(); // Cleanup may close the obsolete popup without consuming this key.
});
