import { EditorSelection, EditorState } from "@codemirror/state";
import { editorInfoField } from "./editorInfoFixture";
import { App, Notice, Plugin, TFile, TFolder, EditorSuggestContext, MarkdownFileInfo } from "obsidian";
import type Entities from "../src/main";
import { ActionContext, ActionResult, EntitySuggestionItem, SuggestionAction } from "../src/suggestion.types";
import { EntitiesSuggestor } from "../src/EntitiesSuggestor";
import { EditorBindings } from "../src/editorBindings";
import ProviderRegistry from "../src/Providers/ProviderRegistry";
import { TestEvents, mountTestEditor, destroyTestEditors } from "./editorTestHarness";
import { HelperEntityProvider } from "../src/Providers/HelperActionsProvider";
import { TemplateEntityProvider } from "../src/Providers/TemplateProvider";
import { TriggerCharacter } from "../src/entities.types";

jest.mock("obsidian", () => ({
	...jest.requireActual("./__mocks__/obsidian"),
	EditorSuggest: class { context: EditorSuggestContext | null = null; close() { this.context = null; } },
	Notice: jest.fn(), moment: jest.requireActual("moment"),
	prepareFuzzySearch: () => () => ({ score: 10, matches: [] }),
}));
jest.mock("../src/userComponents", () => ({ EntitiesNotice: jest.fn() }));
jest.mock("../src/ui/providerSettingsComponents", () => ({}));

const file = (path: string) => Object.assign(new TFile(), { path, name: path.split("/").pop()!, extension: path.split(".").pop()!, basename: path.split("/").pop()!.replace(/\.[^.]+$/, "") });
const outcome = (text = "result"): ActionResult => ({ status: "target", target: { kind: "text", text } });
const event = new KeyboardEvent("keydown", { key: "Enter" });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture(snapshot = "@Thing", query = "@Thing") {
	const files = new Map<string, TFile | TFolder>();
	const workspace = Object.assign(new TestEvents(), { activeEditor: null as MarkdownFileInfo | null });
	const vault = Object.assign(new TestEvents(), { getAbstractFileByPath: (path: string) => files.get(path), getFolderByPath: () => ({ children: [] }) });
	const generate = jest.fn((target: TFile, source: string, _sub?: string, alias?: string) => `native:${target.path}:${source}:${alias ?? ""}`);
	const app = { workspace, vault, fileManager: { generateMarkdownLink: generate } } as unknown as App;
	const bindings = new EditorBindings(app), cleanups: (() => void)[] = [];
	bindings.register({ registerEditorExtension() {}, register: (cb: () => void) => cleanups.push(cb), registerEvent: (ref: ReturnType<TestEvents["on"]>) => cleanups.push(() => ref.emitter.offref(ref)) } as unknown as Plugin);
	const addEditor = (path: string, text = "@Thing", search = "@Thing", reuse?: ReturnType<typeof mountTestEditor>["editor"]) => {
		const source = file(path); files.set(path, source); return mountTestEditor(app, bindings, source, text, search, reuse);
	};
	const source = addEditor("Writing/Source.md", snapshot, query);
	let rows: EntitySuggestionItem[] = [];
	const provider = { providerInstanceId: "test", getEntityList: () => rows, getTemplateCreationSuggestions: () => [], getRefreshBehavior: () => "never" };
	let listener = () => {};
	const registry = { revision: 1, onChange: (cb: () => void) => { listener = cb; return () => {}; }, getProviders: () => [provider], getProvidersForTrigger: () => [provider] } as unknown as ProviderRegistry;
	const plugin = { app } as Entities, suggestor = new EntitiesSuggestor(plugin, registry, bindings);
	const use = (callback: SuggestionAction) => { rows = [{ suggestionText: "Thing", target: { kind: "action", id: "one", callback } }]; suggestor.invalidateData(); return suggestor.getSuggestions(source.context)[0]; };
	const replace = () => { Object.assign(registry, { revision: registry.revision + 1 }); listener(); };
	return { ...source, app, plugin, workspace, vault, files, generate, bindings, suggestor, use, replace, addEditor,
		unload: () => { suggestor.dispose(); cleanups.forEach(cleanup => cleanup()); } };
}

afterEach(() => { destroyTestEditors(); jest.restoreAllMocks(); jest.clearAllMocks(); });

test.each(["same row", "fresh retrieval", "reentrant callback", "close before select"])("selection settles once: %s", async mode => {
	const h = fixture(), gate = deferred<ActionResult>();
	const action = jest.fn(() => { if (mode === "reentrant callback") h.suggestor.selectSuggestion(row, event); return gate.promise; });
	const row = h.use(action);
	if (mode === "close before select") { h.suggestor.context = h.context; h.suggestor.close(); }
	h.suggestor.selectSuggestion(row, event);
	h.suggestor.selectSuggestion(mode === "fresh retrieval" ? h.suggestor.getSuggestions(h.context)[0] : row, event);
	gate.resolve(outcome()); await flush();
	expect(action).toHaveBeenCalledTimes(1); expect(h.editor.getValue()).toBe("result"); expect(h.editor.transaction).toHaveBeenCalledTimes(1);
});

test("composition confirmation leaves selection available for an ordinary event", () => {
	const h = fixture(), action = jest.fn(() => outcome()), row = h.use(action);
	h.suggestor.selectSuggestion(row, new KeyboardEvent("keydown", { key: "Enter", isComposing: true }));
	expect(action).not.toHaveBeenCalled();
	h.suggestor.selectSuggestion(row, event); h.suggestor.selectSuggestion(row, event);
	expect(action).toHaveBeenCalledTimes(1); expect(h.editor.getValue()).toBe("result");
});

test("synchronous targets commit immediately with one named transaction and no callback editor access", () => {
	const h = fixture("start @Thing tail"), action = jest.fn((context: ActionContext) => {
		expect(Object.isFrozen(context)).toBe(true); expect(Object.isFrozen(context.selections[0])).toBe(true);
		expect(Object.keys(context).sort()).toEqual(["canStartWork", "selections", "snapshot", "source", "trigger"]);
		expect(Object.isFrozen(context.source.file)).toBe(false); return outcome("a\nb");
	});
	h.suggestor.selectSuggestion(h.use(action), event);
	expect(h.editor.getValue()).toBe("start a\nb tail");
	expect(h.editor.transaction).toHaveBeenCalledWith({ changes: [{ from: { line: 0, ch: 6 }, to: { line: 0, ch: 12 }, text: "a\nb" }], selection: { from: { line: 1, ch: 1 } } }, "input.complete");
	expect(h.editor.replaceRange).not.toHaveBeenCalled(); expect(h.editor.setCursor).not.toHaveBeenCalled();
});

test.each(["inside edit", "outside edit", "edit undo", "selection", "source rename", "source delete", "source replace", "observed switch back", "binding replace", "editor reuse", "missing field", "detach", "window close", "reconfigure", "unload"])("pending insertion refuses %s", async mode => {
	const h = fixture("@Thing tail"), gate = deferred<ActionResult>(), target = file("Created.md");
	h.files.set(target.path, target);
	let context!: ActionContext;
	h.suggestor.selectSuggestion(h.use(input => { context = input; return gate.promise; }), event);
	if (mode === "inside edit") h.view.dispatch({ changes: { from: 1, to: 2, insert: "x" } });
	if (mode === "outside edit") h.view.dispatch({ changes: { from: h.view.state.doc.length, insert: "x" } });
	if (mode === "edit undo") { h.view.dispatch({ changes: { from: 0, insert: "x" } }); h.view.dispatch({ changes: { from: 0, to: 1 } }); }
	if (mode === "selection") h.view.dispatch({ selection: { anchor: 0 } });
	if (mode === "source rename") { const old = h.context.file.path; h.files.delete(old); h.context.file.path = "Renamed.md"; h.files.set("Renamed.md", h.context.file); h.vault.trigger("rename", h.context.file, old); }
	if (mode === "source delete") { h.files.delete(h.context.file.path); h.vault.trigger("delete", h.context.file); }
	if (mode === "source replace") h.files.set(h.context.file.path, file(h.context.file.path));
	if (mode === "observed switch back") { const other = h.addEditor("Other.md"); h.workspace.trigger("active-leaf-change", other.info); h.workspace.activeEditor = h.info; h.workspace.trigger("active-leaf-change", h.info); }
	if (mode === "binding replace") { const replacement = { ...h.info }; h.setInfo(replacement); h.workspace.activeEditor = replacement; }
	if (mode === "editor reuse") h.addEditor("Other.md", "@Thing tail", "@Thing", h.editor);
	if (mode === "missing field") h.setInfo(undefined);
	if (mode === "detach") { h.view.dom.remove(); h.workspace.trigger("layout-change"); }
	if (mode === "window close") h.workspace.trigger("window-close", {}, window);
	if (mode === "reconfigure") h.replace();
	if (mode === "unload") h.unload();
	expect(context.canStartWork()).toBe(false);
	gate.resolve({ status: "created", file: target }); await flush();
	expect(h.editor.transaction).not.toHaveBeenCalled(); expect(h.files.get(target.path)).toBe(target);
	if (mode === "unload") expect(Notice).not.toHaveBeenCalled();
	else expect(Notice).toHaveBeenCalledWith(expect.stringContaining("was created, but its link"), 8000);
});

test("old completion cannot release a newer operation after invalidation", async () => {
	const h = fixture(), old = deferred<ActionResult>(), fresh = deferred<ActionResult>();
	h.suggestor.selectSuggestion(h.use(() => old.promise), event);
	h.view.dispatch({ changes: { from: 0, insert: "x" } }); h.view.dispatch({ changes: { from: 0, to: 1 } });
	const second = jest.fn(() => fresh.promise);
	h.suggestor.selectSuggestion(h.use(second), event);
	old.resolve(outcome("old")); await flush();
	h.suggestor.selectSuggestion(h.suggestor.getSuggestions(h.context)[0], event);
	expect(second).toHaveBeenCalledTimes(1);
	fresh.resolve(outcome("new")); await flush(); expect(h.editor.getValue()).toBe("new");
});

test("modal return without earlier focus, target/index events, layout noise and fresh retrieval preserve pending work", async () => {
	const h = fixture(), gate = deferred<ActionResult>();
	h.suggestor.selectSuggestion(h.use(() => gate.promise), event);
	// Initial valid selection seeded focus; this is its first delivered focus event.
	h.view.contentDOM.dispatchEvent(new FocusEvent("focus"));
	h.workspace.trigger("layout-change"); h.vault.trigger("create", file("Target.md")); h.suggestor.invalidateData();
	h.suggestor.close(); h.suggestor.getSuggestions(h.context);
	gate.resolve(outcome()); await flush(); expect(h.editor.getValue()).toBe("result");
});

test("scoped focus A→B→A invalidates even without workspace activation delivery", async () => {
	const h = fixture(), b = h.addEditor("B.md"), gate = deferred<ActionResult>(); h.workspace.activeEditor = h.info;
	h.suggestor.selectSuggestion(h.use(() => gate.promise), event);
	b.view.contentDOM.dispatchEvent(new FocusEvent("focus")); h.view.contentDOM.dispatchEvent(new FocusEvent("focus"));
	gate.resolve(outcome()); await flush(); expect(h.editor.transaction).not.toHaveBeenCalled();
});

test("missing info becomes available; initial focus baseline permits modal return", async () => {
	const h = fixture(); h.setInfo(undefined);
	const action = jest.fn(() => outcome()); h.suggestor.selectSuggestion(h.use(action), event); expect(action).not.toHaveBeenCalled();
	h.setInfo(h.info); const gate = deferred<ActionResult>();
	h.suggestor.selectSuggestion(h.use(() => gate.promise), event); h.view.contentDOM.dispatchEvent(new FocusEvent("focus"));
	gate.resolve(outcome()); await flush(); expect(h.editor.getValue()).toBe("result");
});

test("stale view destroy cannot clear a newer binding for a reused Editor", () => {
	const h = fixture(), next = h.addEditor("Next.md", "@Thing", "@Thing", h.editor);
	h.view.destroy();
	expect(h.bindings.capture(next.editor, next.context.file)).toBeDefined();
});

test("mutable retrieval positions/query/file and current suggestor context cannot retarget captured input", async () => {
	const h = fixture(), gate = deferred<ActionResult>(), row = h.use(() => gate.promise);
	const originalFile = h.context.file; h.context.start.ch = 5; h.context.query = "wrong"; h.context.file = file("Other.md");
	h.suggestor.context = { ...h.context };
	h.suggestor.selectSuggestion(row, event); gate.resolve(outcome()); await flush();
	expect(h.editor.getValue()).toBe("result"); expect(h.files.get(originalFile.path)).toBe(originalFile);
});

test.each(["negative", "past end", "fractional", "wrong query"])("invalid initial %s refuses work before clamping APIs", mode => {
	const h = fixture();
	if (mode === "negative") h.context.start.ch = 0;
	if (mode === "past end") h.context.end.ch = 999;
	if (mode === "fractional") h.context.start.ch = 1.5;
	if (mode === "wrong query") h.context.query = "@different";
	const action = jest.fn(() => outcome()); h.suggestor.selectSuggestion(h.use(action), event);
	expect(action).not.toHaveBeenCalled(); expect(h.editor.posToOffset).not.toHaveBeenCalled(); expect(h.editor.transaction).not.toHaveBeenCalled();
});

test.each(["sync throw", "async reject", "string", "void", "unknown", "bad file", "bad edit", "nested action"])("one useful failure for %s", async mode => {
	const h = fixture();
	const action = (() => {
		if (mode === "sync throw") throw Error("broken");
		if (mode === "async reject") return Promise.reject(Error("broken"));
		return ({ string: "legacy", void: undefined, unknown: {}, "bad file": { status: "created", file: {} },
			"bad edit": { status: "edit", edit: { from: -1, to: 0, text: "x", cursor: 0 } },
			"nested action": { status: "target", target: { kind: "action", id: "x", callback: () => outcome() } } } as Record<string, unknown>)[mode];
	}) as SuggestionAction;
	const row = h.use(action); h.suggestor.selectSuggestion(row, event); h.suggestor.selectSuggestion(row, event); await flush();
	expect(h.editor.transaction).not.toHaveBeenCalled(); expect(Notice).toHaveBeenCalledTimes(1);
});

test.each(["rename", "delete", "recreate", "format failure", "formatter edits source"])("confirmed creation handles target %s honestly", async mode => {
	const h = fixture(), gate = deferred<ActionResult>(), target = file("Created.canvas"); h.files.set(target.path, target);
	h.suggestor.selectSuggestion(h.use(() => gate.promise), event);
	if (mode === "rename") { h.files.delete(target.path); target.path = "Moved.canvas"; h.files.set(target.path, target); }
	if (mode === "delete") h.files.delete(target.path);
	if (mode === "recreate") h.files.set(target.path, file(target.path));
	if (mode === "format failure") h.generate.mockImplementation(() => { throw Error("format"); });
	if (mode === "formatter edits source") h.generate.mockImplementation(() => { h.view.dispatch({ changes: { from: 0, insert: "x" } }); return "native"; });
	gate.resolve({ status: "created", file: target }); await flush();
	if (mode === "rename") { expect(h.generate).toHaveBeenCalledWith(target, "Writing/Source.md", undefined, target.name); expect(h.editor.transaction).toHaveBeenCalledTimes(1); }
	else { expect(h.editor.transaction).not.toHaveBeenCalled(); expect(Notice).toHaveBeenCalledWith(expect.stringContaining("was created, but its link"), 8000); }
});

test.each([undefined, "2.11.1", "2.25.0"])("Template insertion remains unavailable with zero effects for %s", version => {
	const h = fixture(), template = file("Templates/Thing.md"), engine = { append_template_to_active_file: jest.fn(), parse_template: jest.fn(), create_new_note_from_template: jest.fn() };
	Object.assign(h.app, { plugins: { getPlugin: () => version ? { manifest: { version }, templater: engine } : undefined }, commands: { executeCommandById: jest.fn() } });
	Object.assign(h.vault, { getFolderByPath: () => ({ children: [template] }) });
	const provider = new TemplateEntityProvider(h.plugin, { providerInstanceId: "insert", actionType: "insert", path: "Templates", trigger: TriggerCharacter.At });
	const row = provider.getEntityList()[0]; expect(row.noteText).toContain("Insertion unavailable in Entities");
	if (row.target.kind !== "action") throw Error("action required");
	const displayed = h.use(row.target.callback); h.suggestor.selectSuggestion(displayed, event); h.suggestor.selectSuggestion(displayed, event);
	expect(h.editor.getValue()).toBe("@Thing"); expect(h.editor.transaction).not.toHaveBeenCalled();
	Object.values(engine).forEach(fn => expect(fn).not.toHaveBeenCalled());
	expect(Notice).toHaveBeenCalledTimes(1); expect(Notice).toHaveBeenCalledWith(expect.stringContaining("Templater: Open insert template modal"), 8000);
	expect(Notice).toHaveBeenCalledWith(expect.stringContaining(template.path), 8000);
});

test("Helper callout uses one transaction and resulting body caret", () => {
	const h = fixture("before\n\tTask /note tail\nafter", "/note");
	const provider = new HelperEntityProvider(h.plugin, { providerInstanceId: "helper" });
	const row = provider.getEntityList("note", TriggerCharacter.Slash).find(row => row.suggestionText === "Callout: Note")!;
	if (row.target.kind !== "action") throw Error("action required");
	h.suggestor.selectSuggestion(h.use(row.target.callback), event);
	expect(h.editor.getValue()).toBe("before\n\t> [!note]\n\t> Task  tail\nafter");
	expect(h.editor.listSelections()).toEqual([{ anchor: { line: 2, ch: 13 }, head: { line: 2, ch: 13 } }]);
	expect(h.editor.transaction).toHaveBeenCalledTimes(1);
});

test("selection movement away and back without a document edit permits completion", async () => {
	const h = fixture(), gate = deferred<ActionResult>();
	h.suggestor.selectSuggestion(h.use(() => gate.promise), event);
	h.view.dispatch({ selection: { anchor: 0 } }); h.view.dispatch({ selection: { anchor: 6 } });
	gate.resolve(outcome()); await flush(); expect(h.editor.getValue()).toBe("result");
});

test("renaming a parent folder away and back invalidates its source binding", async () => {
	const h = fixture(), gate = deferred<ActionResult>(), folder = Object.assign(new TFolder(), { path: "Renamed" });
	h.suggestor.selectSuggestion(h.use(() => gate.promise), event);
	h.context.file.path = "Renamed/Source.md"; h.vault.trigger("rename", folder, "Writing");
	h.context.file.path = "Writing/Source.md"; folder.path = "Writing"; h.vault.trigger("rename", folder, "Renamed");
	gate.resolve(outcome()); await flush(); expect(h.editor.transaction).not.toHaveBeenCalled();
});

test("async malformed result and throwing feedback do not leave an unhandled rejection or retry", async () => {
	const h = fixture(); jest.mocked(Notice).mockImplementation(() => { throw Error("notice unavailable"); });
	const action = jest.fn(async () => "legacy") as unknown as SuggestionAction;
	h.suggestor.selectSuggestion(h.use(action), event); await flush();
	expect(action).toHaveBeenCalledTimes(1); expect(Notice).toHaveBeenCalledTimes(1); expect(h.editor.transaction).not.toHaveBeenCalled();
});

test("reentrant editor updates cannot recommit a consumed selection", () => {
	const h = fixture(); const action = jest.fn(() => outcome()); const row = h.use(action);
	h.workspace.on("editor-change", () => h.suggestor.selectSuggestion(row, event));
	h.suggestor.selectSuggestion(row, event);
	expect(action).toHaveBeenCalledTimes(1); expect(h.editor.transaction).toHaveBeenCalledTimes(1);
});


test("moving the caret before selection refuses a retained row", () => {
	const h = fixture(), action = jest.fn(() => outcome()), row = h.use(action);
	h.view.dispatch({ selection: { anchor: 0 } });
	h.suggestor.selectSuggestion(row, event);
	expect(action).not.toHaveBeenCalled(); expect(h.editor.transaction).not.toHaveBeenCalled();
});


test("an absent public field or missing Editor fails safely and can bind on a later state", () => {
	const h = fixture(), action = jest.fn(() => outcome());
	h.view.setState(EditorState.create({ doc: "@Thing", selection: { anchor: 6 }, extensions: [h.bindings.extension] }));
	h.suggestor.selectSuggestion(h.use(action), event); expect(action).not.toHaveBeenCalled();
	h.view.setState(EditorState.create({ doc: "@Thing", selection: { anchor: 6 }, extensions: [editorInfoField.init(() => ({ app: h.app, file: h.context.file })), h.bindings.extension] }));
	h.suggestor.selectSuggestion(h.use(action), event); expect(action).not.toHaveBeenCalled();
	h.setInfo(h.info); h.suggestor.selectSuggestion(h.use(action), event);
	expect(action).toHaveBeenCalledTimes(1); expect(h.editor.getValue()).toBe("result");
});

test("all selections are captured and a moved secondary selection invalidates insertion", async () => {
	const h = fixture(), gate = deferred<ActionResult>();
	h.view.setState(EditorState.create({ doc: "@Thing", selection: EditorSelection.create([EditorSelection.cursor(2), EditorSelection.cursor(6)], 1),
		extensions: [EditorState.allowMultipleSelections.of(true), editorInfoField.init(() => h.info), h.bindings.extension] }));
	h.suggestor.selectSuggestion(h.use(context => { expect(context.selections).toHaveLength(2); return gate.promise; }), event);
	h.view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(6)], 1) });
	gate.resolve(outcome()); await flush(); expect(h.editor.transaction).not.toHaveBeenCalled();
});

test("moving an owned view to a different document invalidates the captured owner", async () => {
	const h = fixture(), gate = deferred<ActionResult>(), frame = document.createElement("iframe");
	document.body.appendChild(frame);
	h.suggestor.selectSuggestion(h.use(() => gate.promise), event);
	frame.contentDocument!.body.appendChild(h.view.dom);
	gate.resolve(outcome()); await flush(); expect(h.editor.transaction).not.toHaveBeenCalled();
	frame.remove();
});
