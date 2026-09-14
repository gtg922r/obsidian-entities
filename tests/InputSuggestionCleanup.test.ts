import { App, Notice, Scope } from "obsidian";
import { InputSuggestScope } from "../src/ui/inputSuggestLifecycle";
import { TextInputSuggest } from "../src/ui/suggest";
import { createKeymap, createPopper, installInputSuggestDom, poppers, trackCreatedElementListeners, trackListeners } from "./inputSuggestHostMock";

jest.mock("obsidian", () => ({ ...jest.requireActual("./__mocks__/obsidian"), Notice: jest.fn() }));
jest.mock("@popperjs/core", () => ({ createPopper: jest.requireActual<typeof import("./inputSuggestHostMock")>("./inputSuggestHostMock").createPopper }));

class Picker extends TextInputSuggest<string> {
	protected getCatalog() { return ["Alpha", "Beta"]; }
	protected filterCatalog(catalog: string[], query: string) { return catalog.filter(value => value.includes(query)); }
	renderSuggestion(value: string, el: HTMLElement) { el.setText(value); }
	selectSuggestion(value: string) { this.commitValue(value); }
}

let restores: (() => void)[];
let owners: InputSuggestScope[];
let errors: jest.SpyInstance;

function otherDocument() {
	const iframe = document.createElement("iframe");
	document.body.appendChild(iframe);
	const doc = iframe.contentDocument!;
	restores.push(installInputSuggestDom(doc));
	return doc;
}

function harness(doc = document, parent?: InputSuggestScope) {
	const keymap = createKeymap();
	const app = { keymap, scope: new Scope() } as unknown as App;
	const root = doc.createElement("div");
	const input = doc.createElement("input");
	root.appendChild(input); doc.body.appendChild(root);
	const inputListeners = trackListeners(input);
	const owner = new InputSuggestScope(root, parent);
	owners.push(owner);
	const picker = new Picker(app, input);
	return { keymap, root, input, owner, picker, inputListeners };
}

beforeEach(() => {
	poppers.length = 0; createPopper.mockClear(); jest.mocked(Notice).mockClear();
	restores = [installInputSuggestDom(document)]; owners = [];
	errors = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	for (const owner of owners) {
		try { owner.dispose(); } catch { /* Failed-path tests still remove their fixture DOM below. */ }
	}
	restores.reverse().forEach(restore => restore());
	document.body.replaceChildren(); jest.restoreAllMocks();
});

test("disposing an adopted rendered root removes listeners from the exact original window", () => {
	const originalListeners = trackListeners(window);
	const doc = otherDocument(); const laterListeners = trackListeners(doc.defaultView!);
	const h = harness(); h.input.focus(); h.picker.close();
	doc.adoptNode(h.root); doc.body.appendChild(h.root);
	h.owner.dispose();
	expect(h.keymap.scopes).toHaveLength(0);
	expect(h.inputListeners).toHaveLength(0);
	expect(originalListeners.filter(item => item.type === "blur" || item.type === "pagehide")).toHaveLength(0);
	expect(laterListeners).toHaveLength(0);
	expect(poppers[0].destroy).toHaveBeenCalledTimes(1);
});

test.each(["root", "input"])("adopting an active %s retires its old popup and refuses to bind it in another document", adopted => {
	const originalListeners = trackListeners(window);
	const doc = otherDocument(); const laterListeners = trackListeners(doc.defaultView!);
	const h = harness(); h.input.focus();
	const popup = poppers[0].popup;
	const node = adopted === "root" ? h.root : h.input;
	doc.adoptNode(node); doc.body.appendChild(node);
	h.input.focus(); h.picker.open(); h.picker.selectSuggestion("Alpha");
	expect(h.input.value).toBe("");
	expect(h.keymap.scopes).toHaveLength(0);
	expect(createPopper).toHaveBeenCalledTimes(1);
	expect(popup.isConnected).toBe(false);
	expect(doc.querySelector(".suggestion-container")).toBeNull();
	h.owner.dispose();
	expect(h.inputListeners).toHaveLength(0);
	expect(originalListeners.filter(item => item.type === "blur" || item.type === "pagehide")).toHaveLength(0);
	expect(laterListeners).toHaveLength(0);
});

test("a throwing Popper destroy still releases DOM, listeners, scope and later sibling cleanup", () => {
	const parent = new InputSuggestScope(); owners.push(parent);
	const windowListeners = trackListeners(window);
	const elementListeners = trackCreatedElementListeners(document);
	const first = harness(document, parent); const sibling = harness(document, parent);
	const siblingCleanup = jest.fn(); sibling.owner.own(siblingCleanup);
	first.input.focus();
	const failure = new Error("synthetic positioning cleanup failure");
	poppers[0].destroy.mockImplementationOnce(() => { throw failure; });
	expect(() => parent.dispose()).not.toThrow();
	expect(first.keymap.scopes).toHaveLength(0); expect(sibling.keymap.scopes).toHaveLength(0);
	expect(first.inputListeners).toHaveLength(0); expect(sibling.inputListeners).toHaveLength(0);
	expect(windowListeners.filter(item => item.type === "blur" || item.type === "pagehide")).toHaveLength(0);
	expect(elementListeners.every(listeners => listeners.length === 0)).toBe(true);
	expect(document.querySelectorAll(".suggestion-container")).toHaveLength(0);
	expect(siblingCleanup).toHaveBeenCalledTimes(1);
	first.picker.dispose(); first.picker.close(); parent.dispose();
	expect(poppers[0].destroy).toHaveBeenCalledTimes(1);
	expect(errors.mock.calls.some(args => args.includes(failure))).toBe(true);
	expect(Notice).not.toHaveBeenCalled();
});

test("throwing scope cleanup still runs later cleanup and leaves guarded saves inactive", () => {
	const root = document.createElement("div"); document.body.appendChild(root);
	const scope = new InputSuggestScope(root); owners.push(scope);
	const failure = new Error("synthetic scope cleanup failure");
	const later = jest.fn(); const save = jest.fn();
	scope.own(() => { throw failure; }); scope.own(later);
	const lateSave = scope.guard(save);
	expect(() => scope.dispose()).not.toThrow();
	lateSave(); scope.dispose();
	expect(later).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
	expect(scope.active).toBe(false);
	expect(errors.mock.calls.some(args => args.includes(failure))).toBe(true);
	expect(Notice).not.toHaveBeenCalled();
});
