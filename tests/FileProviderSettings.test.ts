import { App, Plugin, Setting, TFile, TFolder } from "obsidian";
import type Entities from "../src/main";
import { EntitiesSettingTab, ProviderSettingsModal } from "../src/EntitiesSettings";
import { FolderEntityProvider } from "../src/Providers/FolderEntityProvider";
import { DataviewEntityProvider } from "../src/Providers/DataviewEntityProvider";
import { TemplateEntityProvider } from "../src/Providers/TemplateProvider";
import { CharacterProvider } from "../src/Providers/CharacterProvider";
import { SettingsStore } from "../src/SettingsStore";
import { EntitiesNotice, IconPickerModal } from "../src/userComponents";
import { FrontmatterKeySuggest } from "../src/ui/FrontmatterKeySuggest";
import { InputSuggestScope } from "../src/ui/inputSuggestLifecycle";
import { createKeymap, installInputSuggestDom, poppers, suggestionRows } from "./inputSuggestHostMock";

type Control = { inputEl: HTMLInputElement; text: string; tooltip: string; value: string; placeholder: string; change: (value: string) => void; click: () => void };
type Row = { name: string; description: string; controls: Control[]; settingEl: HTMLElement };
const mockRows: Row[] = [];
const mockModals: ProviderSettingsModal[] = [];

jest.mock("obsidian", () => {
	function element(parent?: HTMLElement) {
		const el = document.createElement("div");
		Object.assign(el, {
			empty: () => el.replaceChildren(), createDiv: () => element(el),
			addClass: (name: string) => el.classList.add(name), removeClass: (name: string) => el.classList.remove(name),
			setText: (value: string) => { el.textContent = value; },
		});
		parent?.appendChild(el);
		return el;
	}
	class Control {
		text = ""; tooltip = ""; value = ""; placeholder = "";
		inputEl = document.createElement("input"); extraSettingsEl = element();
		change: (value: string) => void = () => {}; click: () => void = () => {};
		constructor(parent?: HTMLElement) { parent?.append(this.inputEl); Object.assign(this.inputEl, { trigger: (type: string) => this.inputEl.dispatchEvent(new Event(type)) }); }
		setButtonText(value: string) { this.text = value; return this; }
		setIcon(value: string) { this.text = value; return this; }
		setTooltip(value: string) { this.tooltip = value; return this; }
		setValue(value: string) { this.value = value; this.inputEl.value = value; return this; }
		setPlaceholder(value: string) { this.placeholder = value; this.inputEl.placeholder = value; return this; }
		getValue() { return this.inputEl.value; }
		onChange(callback: (value: string) => void) { this.change = callback; this.inputEl.addEventListener("input", () => callback(this.inputEl.value)); return this; }
		onClick(callback: () => void) { this.click = callback; return this; }
		setDisabled() { return this; } setCta() { return this; } addOption() { return this; } addOptions() { return this; }
	}
	class MockSetting {
		name = ""; description = ""; controls: Control[] = []; settingEl: HTMLElement;
		constructor(parent?: HTMLElement) { this.settingEl = element(parent); mockRows.push(this); }
		setName(value: string) { this.name = value; return this; }
		setDesc(value: string) { this.description = value; return this; }
		setHeading() { return this; }
		addButton(build: (control: Control) => void) { const c = new Control(this.settingEl); this.controls.push(c); build(c); return this; }
		addText(build: (control: Control) => void) { return this.addButton(build); }
		addToggle(build: (control: Control) => void) { return this.addButton(build); }
		addDropdown(build: (control: Control) => void) { return this.addButton(build); }
		addExtraButton(build: (control: Control) => void) { return this.addButton(build); }
	}
	return {
		...jest.requireActual("./__mocks__/obsidian"), Setting: MockSetting, ButtonComponent: Control, Notice: class {},
		sanitizeHTMLToDom: (html: string) => html,
		PluginSettingTab: class { containerEl = element(document.body); constructor(public app: App) {} },
		Modal: class {
			modalEl = element(); contentEl = element(this.modalEl); titleEl = element(this.modalEl);
			constructor(public app: App) { mockModals.push(this as unknown as ProviderSettingsModal); }
			open() { document.body.append(this.modalEl); (this as unknown as ProviderSettingsModal).onOpen(); }
			close() { this.modalEl.remove(); (this as unknown as ProviderSettingsModal).onClose(); }
		},
	};
});
jest.mock("@popperjs/core", () => ({ createPopper: jest.requireActual("./inputSuggestHostMock").createPopper }));
jest.mock("../src/userComponents", () => ({ ...jest.requireActual("../src/userComponents"), EntitiesNotice: jest.fn(), IconPickerModal: jest.fn() }));

const types = [FolderEntityProvider, DataviewEntityProvider];
const file = Object.assign(new TFile(), { path: "People/Bob Hope.md", basename: "Bob Hope" });
const child = Object.assign(new TFile(), { path: "People/Sub/Child.png", basename: "Child" });
const sub = Object.assign(new TFolder(), { children: [child], path: "People/Sub" });
const folder = Object.assign(new TFolder(), { children: [file, sub], path: "People" });
const rootFolder = Object.assign(new TFolder(), { path: "/", children: [folder] });
const filter = (property: string, value = "yes") => ({ type: "include" as const, property, value });
const controls = (root: HTMLElement) => mockRows.filter(r => root.contains(r.settingEl)).flatMap(r => r.controls);
const patterns = (root: HTMLElement) => controls(root).filter(c => c.placeholder === "Property value/regex");
const button = (root: HTMLElement, text: string) => controls(root).find(c => c.text === text)!;
const status = (root: HTMLElement) => controls(root).filter(c => c.tooltip).map(c => c.tooltip).join("; ");

async function harness(Provider: typeof FolderEntityProvider | typeof DataviewEntityProvider | typeof CharacterProvider, overrides: Record<string, unknown> = {}) {
	const pages = jest.fn((query: string) => { if (query === "[") throw new Error("bad source"); return query === "empty" ? [] : [{ file: { path: file.path } }, { file: { path: file.path } }, { file: { path: "Missing.md" } }]; });
	const integrations: Record<string, unknown> = { dataview: { api: { pages } } };
	const keymap = createKeymap();
	const app = { keymap, vault: { getRoot: () => rootFolder, getFolderByPath: (path: string) => path === "People" ? folder : path === "/" ? rootFolder : null, getAbstractFileByPath: (path: string) => path === file.path ? file : null, getMarkdownFiles: () => [file], getAllLoadedFiles: () => [rootFolder, folder] }, metadataCache: { getFileCache: () => ({ frontmatter: { yes: "yes", ldap: "hopeb@" } }) }, plugins: { getPlugin: (id: string) => integrations[id] } } as unknown as App;
	const write = jest.fn(async (_settings: unknown) => {});
	const store = new SettingsStore(write, async () => {}, () => Provider.getDefaultSettings());
	const loaded = await store.load(async () => JSON.parse(JSON.stringify({ schemaVersion: 1, providerSettings: [{ ...Provider.getDefaultSettings(), providerInstanceId: "a", path: "People", ...overrides }, { ...Provider.getDefaultSettings(), providerInstanceId: "b", path: "People" }] })));
	expect(loaded).toBe(true);
	const lifetime = new InputSuggestScope();
	mockLifetimes.push(lifetime);
	const plugin = { app, inputSuggestions: lifetime, settingsStore: store, get settings() { return store.settings; }, loadEntityProviders: jest.fn(), saveSettings: () => store.flush(), providerRegistry: { getProviderClasses: () => new Map([[Provider.providerTypeID, Provider]]) } } as unknown as Entities;
	const tab = new EntitiesSettingTab(app, plugin);
	const open = () => { tab.display(); button(tab.containerEl, "settings").click(); return mockModals.at(-1)!; };
	return { app, plugin, store, write, tab, pages, integrations, open, keymap };
}

const mockLifetimes: InputSuggestScope[] = [];
let restoreDom: () => void;
beforeEach(() => {
	restoreDom = installInputSuggestDom(document);
	Object.defineProperty(window.HTMLElement.prototype, "createEl", {
		configurable: true,
		value(this: HTMLElement, tag: string, options?: { text?: string }) {
			const el = this.ownerDocument.createElement(tag);
			if (options?.text) el.textContent = options.text;
			this.appendChild(el);
			return el;
		},
	});
	document.body.replaceChildren(); mockRows.length = 0; mockModals.length = 0; poppers.length = 0; jest.clearAllMocks();
});

afterEach(() => {
	for (const modal of mockModals) if (modal.contentEl.isConnected) modal.close();
	mockLifetimes.splice(0).forEach(scope => scope.dispose());
	document.body.replaceChildren();
	Reflect.deleteProperty(window.HTMLElement.prototype, "createEl");
	restoreDom();
});

describe.each(types.map(Provider => [Provider.providerTypeID, Provider] as const))("%s settings", (_name, Provider) => {
	test("shared filter editor saves invalid then repaired exact text through R1 and reload", async () => {
		const h = await harness(Provider, { entityFilters: [filter("yes")] });
		const modal = h.open();
		patterns(modal.contentEl)[0].change("[");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [filter("yes", "[")] });
		expect(status(modal.contentEl)).toContain("Invalid regex");
		patterns(modal.contentEl)[0].change(" yes ");
		expect(status(modal.contentEl)).toContain("Active filter");
		await h.store.flush();
		const reopened = h.open();
		expect(patterns(reopened.contentEl)[0].value).toBe(" yes ");
		expect(h.write.mock.calls.at(-1)![0]).toMatchObject({ providerSettings: [{ entityFilters: [filter("yes", " yes ")] }, {}] });
	});
	test.each([0, 1, 2])("deleting filter %i rebuilds correct rows and rejects detached handlers", async index => {
		const h = await harness(Provider, { entityFilters: [filter("first"), filter("middle"), filter("last")] });
		const modal = h.open(), old = patterns(modal.contentEl);
		const rows = mockRows.filter(r => modal.contentEl.contains(r.settingEl) && r.controls.some(c => c.placeholder === "Property value/regex"));
		rows[index].controls.find(c => c.text === "trash")!.click();
		old[0].change("detached");
		button(modal.contentEl, "Add filter").click();
		const fresh = patterns(modal.contentEl);
		fresh[0].change("kept");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [...["first", "middle", "last"].filter((_, i) => i !== index).map((p, i) => filter(p, i === 0 ? "kept" : "yes")), filter("", "")] });
		expect(status(modal.contentEl)).toContain("Inactive filter");
	});
	test("two real modal drafts retain whole-array conflicts through rebuild and reopen", async () => {
		const h = await harness(Provider, { entityFilters: [filter("yes"), filter("tail")] });
		const a = h.open(), b = h.open();
		const staleAdd = button(b.contentEl, "Add filter"), stalePattern = patterns(b.contentEl)[0];
		patterns(a.contentEl)[0].change("[");
		staleAdd.click(); stalePattern.change("stale retry"); staleAdd.click();
		expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [filter("yes", "["), filter("tail")] });
		expect(EntitiesNotice).toHaveBeenCalledTimes(1);
		expect(b.contentEl.isConnected).toBe(false);
		const fresh = h.open();
		patterns(fresh.contentEl)[0].change("^yes$");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [filter("yes", "^yes$"), filter("tail")] });
	});
	test("source text remains exact on invalid/unavailable edits and save failure/retry", async () => {
		const h = await harness(Provider);
		h.write.mockRejectedValueOnce(new Error("disk unavailable"));
		if (Provider === DataviewEntityProvider) delete h.integrations.dataview;
		h.tab.display();
		const field = controls(h.tab.containerEl).find(c => c.placeholder === (Provider === FolderEntityProvider ? "Folder path" : "Dataview source"))!;
		field.change(" [ bad source ");
		const key = Provider === FolderEntityProvider ? "path" : "query";
		expect(h.store.settings.providerSettings[0]).toMatchObject({ [key]: " [ bad source " });
		await h.store.flush();
		expect(h.store.saveError).toBeDefined();
		expect(status(h.tab.containerEl)).not.toMatch(/saved/i);
		await h.store.flush();
		expect(h.store.saveError).toBeUndefined();
		expect(h.write.mock.calls.at(-1)![0]).toMatchObject({ providerSettings: [{ [key]: " [ bad source " }, {}] });
	});
	test("unsupported legacy selector is diagnosed, preserved until explicit replacement", async () => {
		const h = await harness(Provider, { propertyToCreateEntitiesFor: ["legacy"], propertyToFilterEntitiesBy: "current-note-legacy" });
		const modal = h.open();
		// The alias control is in the normal provider settings, not a hidden ineffective input.
		const row = mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "Frontmatter alias property")!;
		expect(row).toBeDefined();
		expect(row.description).toContain("Unsupported");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ propertyToCreateEntitiesFor: ["legacy"], propertyToFilterEntitiesBy: "current-note-legacy" });
		row.controls.find(c => c.placeholder === "Property name")!.change("ldap");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ propertyToCreateEntitiesFor: "ldap", propertyToFilterEntitiesBy: "current-note-legacy" });
	});
});

test("Dataview status evaluates once per edit and reports distinct source/filter states", async () => {
	const h = await harness(DataviewEntityProvider);
	h.tab.display();
	expect(h.pages).toHaveBeenCalledTimes(2); // One evaluation per configured provider.
	const source = controls(h.tab.containerEl).find(c => c.placeholder === "Dataview source")!;
	const initial = h.pages.mock.calls.length;
	source.change("empty");
	expect(h.pages).toHaveBeenCalledTimes(initial + 1);
	expect(status(h.tab.containerEl)).toContain("0 qualifying files");
	source.change("[");
	expect(h.pages).toHaveBeenCalledTimes(initial + 2);
	expect(status(h.tab.containerEl)).toContain("Invalid Dataview source");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ query: "[" });
	source.change("");
	expect(status(h.tab.containerEl)).toContain("1 qualifying file");
});

test("Folder counts refresh for recursion and filters without counting aliases", async () => {
	const h = await harness(FolderEntityProvider);
	const modal = h.open();
	expect(status(modal.contentEl)).toContain("1 qualifying file");
	const recursion = mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "Load entities from sub-folders")!;
	recursion.controls[0].change(true as unknown as string);
	expect(status(modal.contentEl)).toContain("2 qualifying files");
	button(modal.contentEl, "Add filter").click();
	const row = mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.controls.some(c => c.placeholder === "Property value/regex"))!;
	row.controls.find(c => c.placeholder === "Property name")!.change("yes");
	patterns(modal.contentEl)[0].change("[");
	expect(status(modal.contentEl)).toContain("Invalid regex");
});

test("Template retains its existing validation-gated folder path behavior", () => {
	const settings = TemplateEntityProvider.getDefaultSettings(), save = jest.fn();
	const plugin = { app: { vault: { getFolderByPath: () => null } } } as unknown as Plugin;
	const setting = new Setting(document.body);
	TemplateEntityProvider.buildSummarySetting(setting, settings, save, plugin);
	controls(document.body).find(c => c.placeholder === "Folder path")!.change("missing");
	expect(save).not.toHaveBeenCalled();
});

test.each(types)("%s normalizes omitted alias defaults and retains toggles by ID across reorder/reopen", async Provider => {
	const h = await harness(Provider, { shouldCreateEntitiesForAliases: undefined });
	const expectedDefault = Provider === FolderEntityProvider;
	expect(h.store.settings.providerSettings[0]).toMatchObject({ shouldCreateEntitiesForAliases: expectedDefault });
	const a = h.open();
	const row = mockRows.find(r => a.contentEl.contains(r.settingEl) && r.name === "Suggest native aliases")!;
	row.controls[0].change(false as unknown as string);
	h.store.reorderProviders(["b", "a"]);
	const b = h.open();
	const rowB = mockRows.find(r => b.contentEl.contains(r.settingEl) && r.name === "Suggest native aliases")!;
	rowB.controls[0].change(true as unknown as string);
	await h.store.flush();
	expect(h.store.settings.providerSettings).toMatchObject([{ providerInstanceId: "b", shouldCreateEntitiesForAliases: true }, { providerInstanceId: "a", shouldCreateEntitiesForAliases: false }]);
	const fresh = h.open();
	expect(mockRows.find(r => fresh.contentEl.contains(r.settingEl) && r.name === "Suggest native aliases")!.controls[0].value).toBe(true);
});

test.each(types)("%s malformed imported filter collections remain R1 protected and unwritable", async Provider => {
	for (const entityFilters of [null, {}, [null], [{ type: "include", property: "yes", value: 42 }]]) {
		const write = jest.fn(), store = new SettingsStore(write, async () => {}, () => Provider.getDefaultSettings());
		expect(await store.load(async () => ({ schemaVersion: 1, providerSettings: [{ providerTypeID: Provider.providerTypeID, providerInstanceId: "bad", entityFilters }] }))).toBe(false);
		expect(store.isReadOnly).toBe(true);
		expect(store.updateProvider("bad", { icon: "edited" })).toBe(false);
		await store.flush();
		expect(write).not.toHaveBeenCalled();
	}
});

test("a detached Dataview source handler cannot overwrite newer source text or evaluate again", async () => {
	const h = await harness(DataviewEntityProvider);
	h.tab.display();
	const old = controls(h.tab.containerEl).find(c => c.placeholder === "Dataview source")!;
	h.tab.display();
	const current = controls(h.tab.containerEl).find(c => c.placeholder === "Dataview source")!;
	current.change("[");
	const calls = h.pages.mock.calls.length;
	old.change("valid-but-stale");
	expect(h.pages).toHaveBeenCalledTimes(calls);
	expect(h.store.settings.providerSettings[0]).toMatchObject({ query: "[" });
	expect(status(h.tab.containerEl)).toContain("Invalid Dataview source");
});


test("Folder empty path resolves the native vault root and remains exact in settings", async () => {
	const h = await harness(FolderEntityProvider);
	h.tab.display();
	const source = controls(h.tab.containerEl).find(c => c.placeholder === "Folder path")!;
	expect(h.app.vault.getFolderByPath("")).toBeNull();
	source.change("");
	expect(status(h.tab.containerEl)).toContain("Folder valid (0 qualifying files of 0 source files)");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "" });
});


describe.each(types.map(Provider => [Provider.providerTypeID, Provider] as const))("%s retained alias controls", (_name, Provider) => {
	test.each(["close", "rebuild"])("actual key selection after modal %s cannot save", async mode => {
		const h = await harness(Provider, { propertyToCreateEntitiesFor: "before" });
		const modal = h.open();
		const row = mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "Frontmatter alias property")!;
		const control = row.controls.find(c => c.placeholder === "Property name")!;
		const retained = new FrontmatterKeySuggest(h.app, control.inputEl);
		if (mode === "close") modal.close(); else modal.display();
		expect(control.inputEl.isConnected).toBe(false);
		retained.selectSuggestion("after-removal");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ propertyToCreateEntitiesFor: "before" });
	});
	test.each(["close", "rebuild"])("native alias toggle after modal %s cannot save", async mode => {
		const h = await harness(Provider, { shouldCreateEntitiesForAliases: false });
		const modal = h.open();
		const old = mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "Suggest native aliases")!.controls[0];
		if (mode === "close") modal.close(); else modal.display();
		expect(old.inputEl.isConnected).toBe(false);
		old.change(true as unknown as string);
		expect(h.store.settings.providerSettings[0]).toMatchObject({ shouldCreateEntitiesForAliases: false });
	});
});


describe.each(types.map(Provider => [Provider.providerTypeID, Provider] as const))("%s popup lifecycle", (_name, Provider) => {
	test.each(["hide", "rebuild", "unload"])("summary popup and retained save close on %s", async reason => {
		const h = await harness(Provider);
		h.tab.display();
		const source = controls(h.tab.containerEl).find(c => c.placeholder === (Provider === FolderEntityProvider ? "Folder path" : "Dataview source"))!;
		source.inputEl.value = "";
		source.inputEl.focus();
		expect(h.keymap.scopes).toHaveLength(1);
		const popper = poppers.at(-1)!;
		const before = h.store.settings;
		if (reason === "hide") h.tab.hide();
		if (reason === "rebuild") h.tab.display();
		if (reason === "unload") h.plugin.inputSuggestions.dispose();
		expect(h.keymap.scopes).toHaveLength(0);
		expect(popper.destroy).toHaveBeenCalledTimes(1);
		expect(popper.popup.isConnected).toBe(false);
		source.change("detached value");
		expect(h.store.settings).toEqual(before);
	});

	test.each(["close", "rebuild", "unload"])("modal alias popup closes on %s and old controls cannot save", async reason => {
		const h = await harness(Provider, { propertyToCreateEntitiesFor: "" });
		const modal = h.open();
		const alias = mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "Frontmatter alias property")!.controls[0];
		alias.inputEl.focus();
		expect(suggestionRows(alias.inputEl).map(row => row.textContent)).toContain("ldap");
		expect(h.keymap.scopes).toHaveLength(1);
		const popper = poppers.at(-1)!;
		if (reason === "close") modal.close();
		if (reason === "rebuild") modal.display();
		if (reason === "unload") h.plugin.inputSuggestions.dispose();
		expect(h.keymap.scopes).toHaveLength(0);
		expect(popper.destroy).toHaveBeenCalledTimes(1);
		alias.change("ldap");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ propertyToCreateEntitiesFor: "" });
	});

	test("filter structural rebuild disposes old key suggestions immediately", async () => {
		const h = await harness(Provider, { entityFilters: [filter("")] });
		const modal = h.open();
		const key = controls(modal.contentEl).filter(c => c.placeholder === "Property name").at(-1)!;
		key.inputEl.focus();
		const popper = poppers.at(-1)!;
		expect(h.keymap.scopes).toHaveLength(1);
		button(modal.contentEl, "Add filter").click();
		expect(popper.destroy).toHaveBeenCalledTimes(1);
		expect(h.keymap.scopes).toHaveLength(0);
		key.change("detached");
		expect(h.store.settings.providerSettings[0].entityFilters).toEqual([filter(""), { type: "include", property: "", value: "" }]);
	});
});

const currentAlias = (modal: ProviderSettingsModal) => mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "Frontmatter alias property")!.controls[0];
const templateButton = (modal: ProviderSettingsModal) => mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "New entity from templates")!.controls[0];

test("detached recursion cannot contaminate a rebuilt modal's next valid edit", async () => {
	const h = await harness(FolderEntityProvider, { shouldLoadSubFolders: false });
	const modal = h.open();
	const retained = mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "Load entities from sub-folders")!.controls[0];
	modal.display();
	retained.change(true as unknown as string);
	expect(h.store.settings.providerSettings[0]).toMatchObject({ shouldLoadSubFolders: false });
	currentAlias(modal).change("ldap");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ shouldLoadSubFolders: false, propertyToCreateEntitiesFor: "ldap" });
});

test("Character advanced settings rebuild isolates retained toggles from the next valid edit", async () => {
	const h = await harness(CharacterProvider, { suggestEmoji: false, suggestFontAwesome: true });
	const modal = h.open();
	const retained = mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "Suggest emoji")!.controls[0];
	button(modal.contentEl, "Show").click();
	expect(button(modal.contentEl, "Hide")).toBeDefined();
	expect(retained.inputEl.isConnected).toBe(false);
	retained.change(true as unknown as string);
	expect(h.store.settings.providerSettings[0]).toMatchObject({ suggestEmoji: false, suggestFontAwesome: true });
	mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "Suggest Font Awesome")!.controls[0].change(false as unknown as string);
	expect(h.store.settings.providerSettings[0]).toMatchObject({ suggestEmoji: false, suggestFontAwesome: false });
});

describe.each(types.map(Provider => [Provider.providerTypeID, Provider] as const))("%s stale modal helpers", (_type, Provider) => {
	test("delayed icon cannot contaminate a rebuilt modal's next valid edit", async () => {
		const h = await harness(Provider, { icon: "before" });
		const modal = h.open();
		let choose!: (icon: string) => void;
		const result = new Promise<string>(resolve => { choose = resolve; });
		jest.mocked(IconPickerModal).mockImplementationOnce(() => ({ open() {}, getInput: () => result }) as unknown as IconPickerModal);
		mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "Icon")!.controls[0].click();
		modal.display();
		choose("old-view-choice"); await Promise.resolve();
		expect(h.store.settings.providerSettings[0].icon).toBe("before");
		currentAlias(modal).change("ldap");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ icon: "before", propertyToCreateEntitiesFor: "ldap" });
	});

	test.each(["close", "rebuild"])("retained icon and template openers do nothing after %s", async mode => {
		const h = await harness(Provider);
		const modal = h.open(), retained = templateButton(modal);
		const icon = mockRows.find(r => modal.contentEl.contains(r.settingEl) && r.name === "Icon")!.controls[0];
		jest.mocked(IconPickerModal).mockImplementationOnce(() => ({ open() {}, getInput: () => Promise.resolve("stale") }) as unknown as IconPickerModal);
		if (mode === "close") modal.close(); else modal.display();
		const count = mockModals.length;
		const pending = retained.click();
		icon.click();
		try {
			expect(mockModals).toHaveLength(count);
			expect(IconPickerModal).not.toHaveBeenCalled();
		} finally {
			if (mockModals.length > count) mockModals.at(-1)!.close();
			await pending;
		}
		if (mode === "rebuild") {
			currentAlias(modal).change("ldap");
			expect(h.store.settings.providerSettings[0]).toMatchObject({ entityCreationTemplates: [], propertyToCreateEntitiesFor: "ldap" });
		}
	});

	test("template completion queued before rebuild cannot contaminate the next valid edit", async () => {
		const h = await harness(Provider);
		const modal = h.open();
		const pending = templateButton(modal).click();
		const child = mockModals.at(-1)!;
		child.contentEl.querySelector<HTMLInputElement>('[placeholder="Entity name"]')!.value = "Stale recipe";
		button(child.contentEl, "Save").click();
		modal.display();
		await pending;
		expect(h.store.settings.providerSettings[0].entityCreationTemplates).toEqual([]);
		currentAlias(modal).change("ldap");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ entityCreationTemplates: [], propertyToCreateEntitiesFor: "ldap" });
	});

	test("current template completion preserves unknown fields and recipe tails", async () => {
		const head = { engine: "templater", templatePath: "Templates/Person.md", folderPath: "People", entityName: "Person", futureField: { preserved: true } };
		const tail = { engine: "disabled", templatePath: "Tail.md", entityName: "Tail", futureField: [1, 2] };
		const h = await harness(Provider, { entityCreationTemplates: [head, tail], futureProviderField: { preserved: true } });
		const modal = h.open();
		const pending = templateButton(modal).click();
		const child = mockModals.at(-1)!;
		child.contentEl.querySelector<HTMLInputElement>('[placeholder="Entity name"]')!.value = "Updated";
		button(child.contentEl, "Save").click();
		await pending;
		modal.display();
		currentAlias(modal).change("ldap");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ entityCreationTemplates: [{ ...head, entityName: "Updated" }, tail], futureProviderField: { preserved: true }, propertyToCreateEntitiesFor: "ldap" });
	});
});
