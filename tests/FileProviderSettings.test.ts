import { App, Plugin, Setting, TFile, TFolder } from "obsidian";
import type Entities from "../src/main";
import { EntitiesSettingTab, ProviderSettingsModal } from "../src/EntitiesSettings";
import { FolderEntityProvider } from "../src/Providers/FolderEntityProvider";
import { DataviewEntityProvider } from "../src/Providers/DataviewEntityProvider";
import { TemplateEntityProvider } from "../src/Providers/TemplateProvider";
import { SettingsStore } from "../src/SettingsStore";
import { EntitiesNotice } from "../src/userComponents";

type Control = { text: string; tooltip: string; value: string; placeholder: string; change: (value: string) => void; click: () => void };
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
		constructor(parent?: HTMLElement) { parent?.append(this.inputEl); }
		setButtonText(value: string) { this.text = value; return this; }
		setIcon(value: string) { this.text = value; return this; }
		setTooltip(value: string) { this.tooltip = value; return this; }
		setValue(value: string) { this.value = value; this.inputEl.value = value; return this; }
		setPlaceholder(value: string) { this.placeholder = value; return this; }
		getValue() { return this.value; }
		onChange(callback: (value: string) => void) { this.change = callback; return this; }
		onClick(callback: () => void) { this.click = callback; return this; }
		setDisabled() { return this; } setCta() { return this; } addOption() { return this; }
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
		...jest.requireActual("./__mocks__/obsidian"), Setting: MockSetting, ButtonComponent: Control,
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
jest.mock("../src/ui/file-suggest", () => ({ FolderSuggest: class {} }));
jest.mock("../src/ui/FrontmatterKeySuggest", () => ({ FrontmatterKeySuggest: class {} }));
jest.mock("../src/ui/suggest", () => ({ TextInputSuggest: class { constructor(public app: App) {} } }));
jest.mock("../src/userComponents", () => ({ EntitiesNotice: jest.fn(), IconPickerModal: class {} }));

const types = [FolderEntityProvider, DataviewEntityProvider];
const file = Object.assign(new TFile(), { path: "People/Bob Hope.md", basename: "Bob Hope" });
const child = Object.assign(new TFile(), { path: "People/Sub/Child.png", basename: "Child" });
const sub = Object.assign(new TFolder(), { children: [child], path: "People/Sub" });
const folder = Object.assign(new TFolder(), { children: [file, sub], path: "People" });
const filter = (property: string, value = "yes") => ({ type: "include" as const, property, value });
const controls = (root: HTMLElement) => mockRows.filter(r => root.contains(r.settingEl)).flatMap(r => r.controls);
const patterns = (root: HTMLElement) => controls(root).filter(c => c.placeholder === "Property value/regex");
const button = (root: HTMLElement, text: string) => controls(root).find(c => c.text === text)!;
const status = (root: HTMLElement) => controls(root).filter(c => c.tooltip).map(c => c.tooltip).join("; ");

async function harness(Provider: typeof FolderEntityProvider | typeof DataviewEntityProvider, overrides: Record<string, unknown> = {}) {
	const pages = jest.fn((query: string) => { if (query === "[") throw new Error("bad source"); return query === "empty" ? [] : [{ file: { path: file.path } }, { file: { path: file.path } }, { file: { path: "Missing.md" } }]; });
	const integrations: Record<string, unknown> = { dataview: { api: { pages } } };
	const app = { vault: { getFolderByPath: (path: string) => path === "People" || path === "" ? folder : null, getAbstractFileByPath: (path: string) => path === file.path ? file : null, getAllLoadedFiles: () => [] }, metadataCache: { getFileCache: () => ({ frontmatter: { yes: "yes", ldap: "hopeb@" } }) }, plugins: { getPlugin: (id: string) => integrations[id] } } as unknown as App;
	const write = jest.fn(async (_settings: unknown) => {});
	const store = new SettingsStore(write, async () => {}, () => Provider.getDefaultSettings());
	const loaded = await store.load(async () => JSON.parse(JSON.stringify({ schemaVersion: 1, providerSettings: [{ ...Provider.getDefaultSettings(), providerInstanceId: "a", path: "People", ...overrides }, { ...Provider.getDefaultSettings(), providerInstanceId: "b", path: "People" }] })));
	expect(loaded).toBe(true);
	const plugin = { app, settingsStore: store, get settings() { return store.settings; }, loadEntityProviders: jest.fn(), saveSettings: () => store.flush(), providerRegistry: { getProviderClasses: () => new Map([[Provider.providerTypeID, Provider]]) } } as unknown as Entities;
	const tab = new EntitiesSettingTab(app, plugin);
	const open = () => { tab.display(); button(tab.containerEl, "settings").click(); return mockModals.at(-1)!; };
	return { app, plugin, store, write, tab, pages, integrations, open };
}

beforeEach(() => { document.body.replaceChildren(); mockRows.length = 0; mockModals.length = 0; jest.clearAllMocks(); });

afterEach(() => { document.body.replaceChildren(); });

describe.each(types)("%s settings", Provider => {
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
