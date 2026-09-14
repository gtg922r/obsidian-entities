import { App, Scope, TFile, TFolder } from "obsidian";
import { FileSuggest, FolderSuggest } from "../src/ui/file-suggest";
import { FrontmatterKeySuggest } from "../src/ui/FrontmatterKeySuggest";
import { DataviewSourceSuggest } from "../src/Providers/DataviewEntityProvider";
import { TextInputSuggest } from "../src/ui/suggest";
import { InputSuggestScope } from "../src/ui/inputSuggestLifecycle";
import { createKeymap, createPopper, installInputSuggestDom, poppers, suggestionRows, trackCreatedElementListeners, trackListeners } from "./inputSuggestHostMock";

jest.mock("obsidian", () => ({
	...jest.requireActual("./__mocks__/obsidian"),
	getAllTags: (cache: { tags?: { tag: string }[] }) => cache.tags?.map(item => item.tag),
}));
jest.mock("@popperjs/core", () => ({ createPopper: jest.requireActual<typeof import("./inputSuggestHostMock")>("./inputSuggestHostMock").createPopper }));
jest.mock("../src/userComponents", () => ({ EntitiesNotice: jest.fn(), IconPickerModal: class {} }));

const file = (path: string) => Object.assign(new TFile(), { path, extension: path.split(".").pop() });
const folder = (path: string) => Object.assign(new TFolder(), { path, children: [] });
const root = folder("/");
const people = folder("People/ Bob Hope ");
const note = file("People/ Bob Hope /Full path.md");
let loaded: (TFile | TFolder)[];
let metadata: { frontmatter: Record<string, unknown>; tags: { tag: string }[] };
let app: App;
let keymap: ReturnType<typeof createKeymap>;
let lifetime: InputSuggestScope;
let restoreDom: (() => void)[];

function input(doc: Document = document) {
	const el = doc.createElement("input");
	doc.body.appendChild(el);
	return el;
}
function type(el: HTMLInputElement, value: string) {
	el.value = value;
	el.dispatchEvent(new el.ownerDocument.defaultView!.Event("input", { bubbles: true }));
}
function escape(el: HTMLInputElement, isComposing = false) {
	el.dispatchEvent(new el.ownerDocument.defaultView!.KeyboardEvent("keydown", { key: "Escape", isComposing, bubbles: true }));
	keymap.press("Escape", el.ownerDocument, isComposing);
}
function rendered(el: HTMLInputElement): string[] {
	return suggestionRows(el).map(row => row.textContent ?? "");
}
function choose(el: HTMLInputElement, label: string) {
	const row = suggestionRows(el).find(item => item.textContent === label);
	expect(row).toBeDefined();
	const mouseDown = new el.ownerDocument.defaultView!.MouseEvent("mousedown", { bubbles: true, cancelable: true });
	row!.dispatchEvent(mouseDown);
	expect(mouseDown.defaultPrevented).toBe(true);
	row!.dispatchEvent(new el.ownerDocument.defaultView!.MouseEvent("click", { bubbles: true, cancelable: true }));
}
function secondDocument(): Document {
	const iframe = document.createElement("iframe");
	document.body.appendChild(iframe);
	const doc = iframe.contentDocument!;
	restoreDom.push(installInputSuggestDom(doc));
	new InputSuggestScope(doc.body, lifetime);
	return doc;
}

beforeEach(() => {
	loaded = [root, people, note, file("Image.png")];
	metadata = { frontmatter: { ldap: "hopeb@", aliases: ["Bob"] }, tags: [{ tag: "#person" }, { tag: "#places" }] };
	keymap = createKeymap();
	app = {
		scope: new Scope(), keymap,
		vault: {
			getAllLoadedFiles: jest.fn(() => loaded), getRoot: () => root,
			getMarkdownFiles: jest.fn(() => loaded.filter((f): f is TFile => f instanceof TFile && f.extension === "md")),
		},
		metadataCache: { getFileCache: jest.fn(() => metadata) },
	} as unknown as App;
	poppers.length = 0;
	createPopper.mockClear();
	lifetime = new InputSuggestScope();
	new InputSuggestScope(document.body, lifetime);
	restoreDom = [installInputSuggestDom(document)];
});
afterEach(() => {
	lifetime.dispose();
	expect(keymap.scopes).toHaveLength(0);
	for (const popper of poppers) expect(popper.destroy).toHaveBeenCalledTimes(1);
	restoreDom.reverse().forEach(restore => restore());
	document.body.replaceChildren();
	jest.restoreAllMocks();
});

test("empty results and close/blur/Escape before opening never allocate positioning or scopes", () => {
	const el = input(); el.value = "absent";
	const suggest = new FileSuggest(app, el);
	expect(() => { suggest.close(); el.dispatchEvent(new Event("blur")); escape(el); }).not.toThrow();
	el.focus();
	expect(rendered(el)).toEqual([]);
	expect(keymap.scopes).toHaveLength(0);
	expect(createPopper).not.toHaveBeenCalled();
	type(el, "Full");
	expect(rendered(el)).toEqual([note.path]);
	const previousScope = keymap.scopes[0] as Scope & { handleKey(event: KeyboardEvent): unknown };
	type(el, "absent");
	expect(keymap.scopes).toHaveLength(0);
	for (const key of ["ArrowUp", "ArrowDown", "Enter"]) {
		expect(() => previousScope.handleKey(new KeyboardEvent("keydown", { key }))).not.toThrow();
	}
	expect(el.value).toBe("absent");
	expect(rendered(el)).toEqual([]);
});

test.each(["blur", "Escape", "dispose"])("closing by %s removes rows and releases resources", reason => {
	const el = input(); const suggest = new FileSuggest(app, el);
	el.focus();
	if (reason === "blur") el.blur();
	if (reason === "Escape") escape(el);
	if (reason === "dispose") suggest.dispose();
	suggest.close();
	expect(keymap.scopes).toHaveLength(0);
	expect(rendered(el)).toEqual([]);
});

test("composing Escape and Enter neither close nor commit", () => {
	const el = input(); new FileSuggest(app, el); const change = jest.fn();
	el.addEventListener("input", change);
	el.focus(); escape(el, true); keymap.press("Enter", document, true);
	expect(rendered(el)).toEqual([note.path]);
	expect(keymap.scopes).toHaveLength(1);
	expect(change).not.toHaveBeenCalled();
});

test("typing and repeated opens keep one scope and one Popper while scanning only on focus", () => {
	const el = input(); const suggest = new FileSuggest(app, el);
	for (let cycle = 0; cycle < 5; cycle++) {
		el.focus(); type(el, "F"); type(el, "Full"); type(el, ""); suggest.open(); suggest.open();
		expect(keymap.scopes).toHaveLength(1);
		expect(createPopper).toHaveBeenCalledTimes(cycle + 1);
		el.blur(); expect(keymap.scopes).toHaveLength(0);
		expect(poppers[cycle].destroy).toHaveBeenCalledTimes(1);
	}
	expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(5);
	expect(app.vault.getAllLoadedFiles).not.toHaveBeenCalled();
	suggest.dispose(); suggest.dispose();
});

test.each(["mouse", "keyboard"])("%s selection uses real navigation and commits one exact path with an owner-window event", mode => {
	const doc = secondDocument(); const el = input(doc);
	const suggest = new FileSuggest(app, el); const change = jest.fn();
	el.addEventListener("input", change); el.focus();
	expect(rendered(el)).toEqual([note.path]);
	expect(poppers[0].popup.ownerDocument).toBe(doc);
	expect(poppers[0].popup.parentElement).toBe(doc.body);
	if (mode === "mouse") choose(el, note.path);
	else keymap.press("Enter", doc);
	suggest.selectSuggestion(note);
	expect(el.value).toBe(note.path);
	expect(change).toHaveBeenCalledTimes(1);
	expect(change.mock.calls[0][0]).toBeInstanceOf(doc.defaultView!.Event);
	expect(change.mock.calls[0][0]).not.toBeInstanceOf(window.Event);
	expect(keymap.scopes).toHaveLength(0);
});

test("retained Arrow navigation wraps and selects the rendered row", () => {
	loaded.push(file("Second.md"));
	const el = input(); new FileSuggest(app, el); el.focus();
	keymap.press("ArrowUp");
	expect(suggestionRows(el).find(row => row.classList.contains("is-selected"))?.textContent).toBe("Second.md");
	keymap.press("ArrowDown"); keymap.press("ArrowDown"); keymap.press("Enter");
	expect(el.value).toBe("Second.md");
});

test("an empty-string suggestion remains selectable by Enter", () => {
	class EmptySuggest extends TextInputSuggest<string> {
		protected getCatalog() { return [""]; }
		protected filterCatalog(catalog: string[]) { return catalog; }
		renderSuggestion(_value: string, el: HTMLElement) { el.setText("Empty selection"); }
		selectSuggestion(value: string) { this.commitValue(value); }
	}
	const el = input(); el.value = "clear this"; new EmptySuggest(app, el);
	const change = jest.fn(); el.addEventListener("input", change); el.focus(); keymap.press("Enter");
	expect(el.value).toBe(""); expect(change).toHaveBeenCalledTimes(1);
});

test.each(["", "/", " Bob "])("folder query %j preserves root and literal paths", query => {
	loaded = [people, note]; // A loaded-file inventory need not contain the canonical root.
	const el = input(); el.value = query; new FolderSuggest(app, el); el.focus();
	const expected = [root, people].filter(f => f.path.toLowerCase().includes(query.toLowerCase()));
	expect(rendered(el)).toEqual(expected.map(item => item.path));
	choose(el, expected[0].path); expect(el.value).toBe(expected[0].path);
});

test.each(["file", "folder", "key", "tag"])("%s catalog refreshes at next focus and never per keystroke", kind => {
	const el = input();
	if (kind === "file") new FileSuggest(app, el);
	else if (kind === "folder") new FolderSuggest(app, el);
	else if (kind === "key") new FrontmatterKeySuggest(app, el);
	else new DataviewSourceSuggest(app, el);
	el.focus();
	const old = rendered(el);
	const scans = [jest.mocked(app.vault.getMarkdownFiles).mock.calls.length, jest.mocked(app.vault.getAllLoadedFiles).mock.calls.length, jest.mocked(app.metadataCache.getFileCache).mock.calls.length];
	loaded.push(file("Fresh.md"), folder("Fresh"));
	metadata = { frontmatter: { fresh: "value" }, tags: [{ tag: "#fresh" }] };
	type(el, "f"); type(el, ""); expect(rendered(el)).toEqual(old);
	expect([jest.mocked(app.vault.getMarkdownFiles).mock.calls.length, jest.mocked(app.vault.getAllLoadedFiles).mock.calls.length, jest.mocked(app.metadataCache.getFileCache).mock.calls.length]).toEqual(scans);
	el.blur(); el.focus();
	expect(rendered(el)).not.toEqual(old);
});

test.each([
	['#person and #pl', '#places', '#person and #places'],
	['#pl or #pl', '#places', '#pl or #places'],
	['#person and "People/ Bob', '"People/ Bob Hope "', '#person and "People/ Bob Hope "'],
	['"People/ Bob Hope " or "People/ Bob', '"People/ Bob Hope "', '"People/ Bob Hope " or "People/ Bob Hope "'],
	['"', '"/"', '"/"'],
	['', '#person', '#person'],
	['  ', '"People/ Bob Hope "', '  "People/ Bob Hope "'],
])("Dataview replaces only the trailing term in %j", (value, chosen, expected) => {
	const el = input(); el.value = value; new DataviewSourceSuggest(app, el);
	const change = jest.fn(); el.addEventListener("input", change); el.focus();
	expect(rendered(el)).toContain(chosen);
	choose(el, chosen);
	expect(el.value).toBe(expected); expect(change).toHaveBeenCalledTimes(1);
});

test.each(['#person and ', '"People/ Bob Hope "', 'nonsense'])('Dataview leaves complete/invalid expression %j exact and quiet', value => {
	const el = input(); el.value = value; const suggest = new DataviewSourceSuggest(app, el); el.focus();
	expect(rendered(el)).toEqual([]);
	suggest.selectSuggestion('#person'); expect(el.value).toBe(value);
});

test("teardown during synchronous catalog work ignores the completed catalog", () => {
	const el = input(); const scope = new InputSuggestScope(el);
	const suggest = new FrontmatterKeySuggest(app, el);
	jest.mocked(app.metadataCache.getFileCache).mockImplementation(() => { scope.dispose(); return metadata; });
	el.focus();
	expect(rendered(el)).toEqual([]); expect(keymap.scopes).toHaveLength(0);
	expect(createPopper).not.toHaveBeenCalled();
	suggest.selectSuggestion("ldap"); expect(el.value).toBe("");
});

test("catalog failure stays quiet and retries on next focus", () => {
	const el = input(); new FileSuggest(app, el);
	jest.mocked(app.vault.getMarkdownFiles).mockImplementationOnce(() => { throw new Error("unavailable"); });
	el.focus(); expect(rendered(el)).toEqual([]);
	el.blur(); el.focus(); expect(rendered(el)).toEqual([note.path]);
});

test("two distinct documents own independent popup DOM, events, and cleanup", () => {
	const doc = secondDocument();
	const first = input(); const second = input(doc);
	const scopeA = new InputSuggestScope(first); const scopeB = new InputSuggestScope(second);
	const a = new FrontmatterKeySuggest(app, first); new FrontmatterKeySuggest(app, second);
	first.focus(); second.focus();
	expect(poppers.find(record => record.reference === first)?.popup.ownerDocument).toBe(document);
	expect(poppers.find(record => record.reference === second)?.popup.ownerDocument).toBe(doc);
	scopeA.dispose(); choose(second, "ldap"); a.selectSuggestion("aliases");
	expect(first.value).toBe(""); expect(second.value).toBe("ldap");
	scopeB.dispose();
});

test("repeated rendered-view rebuilds release listeners, Popper instances, scopes, and guarded callbacks", () => {
	const parent = new InputSuggestScope(); const save = jest.fn();
	const documentListeners = trackListeners(document);
	const windowListeners = trackListeners(window);
	const elementListeners = trackCreatedElementListeners(document);
	let old: (() => unknown) | undefined;
	for (let i = 0; i < 50; i++) {
		const el = input(); const inputListeners = trackListeners(el);
		const scope = new InputSuggestScope(el, parent);
		old = scope.guard(save); new FileSuggest(app, el); el.focus();
		expect(inputListeners.length).toBeGreaterThan(0);
		scope.dispose(); el.remove(); old();
		expect(keymap.scopes).toHaveLength(0);
		expect(inputListeners).toHaveLength(0);
		expect(documentListeners).toHaveLength(0);
		expect(windowListeners).toHaveLength(0);
		expect(elementListeners.every(listeners => listeners.length === 0)).toBe(true);
		expect(poppers[i].popup.isConnected).toBe(false);
		expect(poppers[i].destroy).toHaveBeenCalledTimes(1);
	}
	expect(save).not.toHaveBeenCalled();
	expect((parent as unknown as { cleanups: Set<unknown> }).cleanups.size).toBe(0);
	parent.dispose(); old!(); expect(save).not.toHaveBeenCalled();
});

test("disposed or detached inputs cannot scan, reopen, or commit through retained callbacks", () => {
	const el = input(); const suggest = new FileSuggest(app, el); const change = jest.fn();
	el.addEventListener("input", change); el.focus();
	suggest.dispose(); el.blur(); el.focus();
	const scans = jest.mocked(app.vault.getMarkdownFiles).mock.calls.length;
	type(el, "typed after disposal"); suggest.open(); suggest.selectSuggestion(note);
	expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(scans);
	expect(change).toHaveBeenCalledTimes(1); expect(el.value).toBe("typed after disposal");
	el.remove(); suggest.selectSuggestion(note); expect(el.value).toBe("typed after disposal");
	expect(keymap.scopes).toHaveLength(0);
});


test("owner-window blur closes and pagehide disposes without affecting another document", () => {
	const doc = secondDocument(); const el = input(doc); new FileSuggest(app, el);
	el.focus();
	window.dispatchEvent(new Event("blur"));
	expect(rendered(el)).toEqual([note.path]);
	doc.defaultView!.dispatchEvent(new doc.defaultView!.Event("blur"));
	expect(keymap.scopes).toHaveLength(0);
	el.blur(); el.focus();
	expect(rendered(el)).toEqual([note.path]);
	doc.defaultView!.dispatchEvent(new doc.defaultView!.Event("pagehide"));
	expect(keymap.scopes).toHaveLength(0);
	const scans = jest.mocked(app.vault.getMarkdownFiles).mock.calls.length;
	el.blur(); el.focus(); type(el, "Full");
	expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(scans);
	expect(rendered(el)).toEqual([]);
});


test("positioning failure releases the scope and retries without rescanning the catalog", () => {
	createPopper.mockImplementationOnce(() => { throw new Error("positioning unavailable"); });
	const el = input(); new FileSuggest(app, el); el.focus();
	expect(keymap.scopes).toHaveLength(0);
	expect(document.querySelector(".suggestion-container")).toBeNull();
	type(el, "Full");
	expect(rendered(el)).toEqual([note.path]);
	expect(keymap.scopes).toHaveLength(1);
	expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);
	expect(createPopper).toHaveBeenCalledTimes(2);
});


test("closing a document releases its view callbacks and plugin registration", () => {
	const doc = secondDocument();
	const el = input(doc);
	const scope = new InputSuggestScope(el, lifetime);
	const save = jest.fn(); const retained = scope.guard(save);
	new FileSuggest(app, el); el.focus();
	doc.defaultView!.dispatchEvent(new doc.defaultView!.Event("pagehide"));
	retained();
	expect(scope.active).toBe(false);
	expect(save).not.toHaveBeenCalled();
	expect(keymap.scopes).toHaveLength(0);
});
