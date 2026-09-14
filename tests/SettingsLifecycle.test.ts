import { App, PluginManifest, Notice } from "obsidian";
import Entities from "../src/main";
import { EntitiesSettingTab, ProviderSettingsModal } from "../src/EntitiesSettings";
import { EntityProvider, EntityProviderUserSettings } from "../src/Providers/EntityProvider";
import { EntitiesNotice, IconPickerModal } from "../src/userComponents";

type Control = { text: string; click: () => void | Promise<void> };
const mockRows: { name: string; description: string; controls: Control[] }[] = [];

jest.mock("obsidian", () => {
	const element = () => ({ empty: () => { mockRows.length = 0; }, addClass() {}, createDiv: () => element(), setText() {} });
	class Button {
		text = "";
		click = () => {};
		setButtonText(text: string) { this.text = text; return this; }
		setIcon(text: string) { this.text = text; return this; }
		onClick(callback: () => void) { this.click = callback; return this; }
		setDisabled() { return this; }
		setTooltip() { return this; }
		setCta() { return this; }
	}
	return {
		...jest.requireActual("./__mocks__/obsidian"),
		Plugin: class {
			constructor(public app: App, public manifest: PluginManifest) {}
			loadData = jest.fn();
			saveData = jest.fn().mockResolvedValue(undefined);
			addSettingTab = jest.fn();
			registerEditorSuggest = jest.fn();
			registerEditorExtension = jest.fn();
			register = jest.fn();
			registerEvent = jest.fn();
		},
		Notice: jest.fn(),
		PluginSettingTab: class { containerEl = element(); constructor(public app: App) {} },
		Modal: class {
			modalEl = element(); contentEl = element(); titleEl = element();
			open() {} close() {}
		},
		ButtonComponent: Button,
		Setting: class {
			name = ""; description = ""; controls: Button[] = [];
			settingEl = { remove: () => { const index = mockRows.indexOf(this); if (index >= 0) mockRows.splice(index, 1); } };
			constructor() { mockRows.push(this); }
			setName(value: string) { this.name = value; return this; }
			setDesc(value: string) { this.description = value; return this; }
			setHeading() { return this; }
			addButton(build: (button: Button) => void) { const button = new Button(); this.controls.push(button); build(button); return this; }
			addExtraButton(build: (button: Button) => void) { return this.addButton(build); }
			addDropdown(build: (dropdown: unknown) => void) {
				build({ addOption() {}, getValue: () => "test" }); return this;
			}
		},
	};
});

jest.mock("../src/userComponents", () => ({ EntitiesNotice: jest.fn(), IconPickerModal: jest.fn() }));
jest.mock("../src/EntitiesSuggestor", () => ({ EntitiesSuggestor: class { dispose() {} invalidateData() {} } }));
jest.mock("../src/Providers/FolderEntityProvider", () => ({}));
jest.mock("../src/Providers/DataviewEntityProvider", () => ({}));
jest.mock("../src/Providers/DateEntityProvider", () => ({}));
jest.mock("../src/Providers/HelperActionsProvider", () => ({}));
jest.mock("../src/Providers/CharacterProvider", () => ({}));
jest.mock("../src/Providers/TemplateProvider", () => ({}));
jest.mock("../src/Providers/MetadataMenuProvider", () => ({}));

interface TestSettings extends EntityProviderUserSettings { label: string; entityFilters?: { property: string; value: string; type: "include" | "exclude" }[] }
const edits = new Map<string, (label: string) => void>();
const filterEdits = new Map<string, (edit: (draft: TestSettings) => void) => void>();
class TestProvider extends EntityProvider<TestSettings> {
	static readonly providerTypeID = "test";
	static getDescription() { return "Test provider"; }
	static getDefaultSettings() { return { providerTypeID: "test", enabled: true, icon: "box", label: "" }; }
	getDefaultSettings() { return TestProvider.getDefaultSettings(); }
	getEntityList() { return []; }
	static buildSummarySetting(_setting: unknown, draft: TestSettings, save: (next: TestSettings) => void) {
		edits.set(draft.label, label => { draft.label = label; save(draft); });
		filterEdits.set(draft.label, edit => { edit(draft); save(draft); });
	}
	static buildSimpleSettings(_setting: unknown, draft: TestSettings, save: (next: TestSettings) => void) {
		TestProvider.buildSummarySetting(_setting, draft, save);
	}
}

function createPlugin(data: unknown, dir = "config/plugins/entities") {
	const files = new Map<string, string>();
	if (data !== undefined) files.set(`${dir}/data.json`, JSON.stringify(data));
	const adapter = {
		exists: jest.fn(async (path: string) => files.has(path)),
		stat: jest.fn(async (path: string) => files.has(path) ? { type: "file" as const, mtime: 0, ctime: 0, size: files.get(path)!.length } : null),
		read: jest.fn(async (path: string) => {
			if (!files.has(path)) throw new Error("Missing file");
			return files.get(path)!;
		}),
		write: jest.fn(async (path: string, raw: string) => { files.set(path, raw); }),
	};
	const app = { vault: { configDir: "config", adapter, on: jest.fn() }, metadataCache: { on: jest.fn() }, workspace: { on: jest.fn(), onLayoutReady: jest.fn() } } as unknown as App;
	const plugin = instantiatePlugin(app, dir);
	return { plugin, adapter, app, files };
}

function instantiatePlugin(app: App, dir = "config/plugins/entities", id = "entities") {
	const plugin = new Entities(app, { dir, id } as PluginManifest);
	jest.spyOn(plugin, "registerEntityProviders").mockImplementation(() => {
		plugin.providerRegistry.registerProviderType(TestProvider);
	});
	return plugin;
}

function dataWrites(plugin: Entities) {
	return jest.mocked(plugin.app.vault.adapter.write).mock.calls
		.filter(([path]) => path.endsWith("/data.json"))
		.map(([, raw]) => JSON.parse(raw));
}

async function tick() {
	for (let i = 0; i < 15; i++) await Promise.resolve();
}

const config = (id: string) => ({ ...TestProvider.getDefaultSettings(), providerInstanceId: id, label: id });
const currentData = { schemaVersion: 1, providerSettings: [config("a"), config("b")] };

beforeEach(() => { mockRows.length = 0; edits.clear(); filterEdits.clear(); jest.clearAllMocks(); });

test("real settings callbacks edit both providers, survive reorder and ignore deleted rows", async () => {
	const { plugin, app } = createPlugin(currentData);
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin);
	const reconstruction = jest.spyOn(plugin, "loadEntityProviders");
	tab.display();
	const lateA = edits.get("a")!;
	const lateB = edits.get("b")!;
	const deleteA = mockRows.find(row => row.name === "Provider #1")!.controls.find(control => control.text === "trash")!;
	lateA("edited A");
	lateB("edited B");
	expect(plugin.settings.providerSettings).toMatchObject([{ label: "edited A" }, { label: "edited B" }]);
	plugin.settingsStore.reorderProviders(["b", "a"]);
	lateB("B after reorder");
	deleteA.click();
	lateA("must not return");
	tab.hide();
	await plugin.saveSettings();
	expect(plugin.settings.providerSettings).toMatchObject([{ providerInstanceId: "b", label: "B after reorder" }]);
	expect(dataWrites(plugin).at(-1).providerSettings).toEqual(plugin.settings.providerSettings);
	expect(reconstruction).toHaveBeenCalledTimes(4);
});

test("modal close flushes pending edits and invokes its close callback", async () => {
	const { plugin, app } = createPlugin(currentData);
	await plugin.onload();
	const close = jest.fn();
	const modal = new ProviderSettingsModal(app, TestProvider, config("a"), plugin, () => {}, close);
	plugin.settingsStore.updateProvider("a", { icon: "star" });
	modal.onClose();
	await plugin.saveSettings();
	expect(close).toHaveBeenCalledTimes(1);
	expect(plugin.settingsStore.hasPendingSave).toBe(false);
});

test("a late draft callback changes only its fields, keeping newer same-provider edits", async () => {
	const { plugin, app } = createPlugin(currentData);
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin);
	tab.display();
	const lateEdit = edits.get("a")!;
	plugin.settingsStore.updateProvider("a", { icon: "new icon" });
	new EntitiesSettingTab(app, plugin).display();
	lateEdit("new label");
	await plugin.saveSettings();
	expect(plugin.settings.providerSettings[0]).toMatchObject({ label: "new label", icon: "new icon" });
});

test("successive icon pickers cannot make another live view revert the latest icon", async () => {
	const { plugin, app } = createPlugin(currentData);
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin);
	tab.display();
	const lateEdit = edits.get("a")!;
	new EntitiesSettingTab(app, plugin).display();
	for (const icon of ["first icon", "last icon"]) {
		jest.mocked(IconPickerModal).mockImplementationOnce(() => ({
			open() {}, getInput: async () => icon,
		}) as unknown as IconPickerModal);
		mockRows.find(row => row.name === "Provider #1")!.controls[0].click();
		await Promise.resolve();
	}
	lateEdit("new label");
	await plugin.saveSettings();
	expect(plugin.settings.providerSettings[0]).toMatchObject({ label: "new label", icon: "last icon" });
});

test("a delayed icon picker rejects a conflict with a newer choice", async () => {
	const { plugin, app } = createPlugin(currentData);
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin);
	tab.display();
	let resolve!: (icon: string) => void;
	const oldChoice = new Promise<string>(done => { resolve = done; });
	jest.mocked(IconPickerModal).mockImplementationOnce(() => ({ open() {}, getInput: () => oldChoice }) as unknown as IconPickerModal);
	mockRows.find(row => row.name === "Provider #1")!.controls[0].click();
	new EntitiesSettingTab(app, plugin).display();
	jest.mocked(IconPickerModal).mockImplementationOnce(() => ({ open() {}, getInput: async () => "newest" }) as unknown as IconPickerModal);
	mockRows.find(row => row.name === "Provider #1")!.controls[0].click();
	await Promise.resolve();
	resolve("stale choice");
	await tick();
	expect(plugin.settings.providerSettings[0].icon).toBe("newest");
	expect(EntitiesNotice).toHaveBeenCalledWith(expect.stringContaining("Your last edit was not applied"), "alert-triangle", 10000);
	await plugin.saveSettings();
});

test("unload starts a final flush without returning a promise or reconstructing providers", async () => {
	const { plugin } = createPlugin(currentData);
	const reconstruction = jest.spyOn(plugin, "loadEntityProviders");
	await plugin.onload();
	expect(reconstruction).toHaveBeenCalledTimes(1);
	plugin.settingsStore.updateProvider("a", { icon: "star" });
	expect(plugin.onunload()).toBeUndefined();
	await plugin.saveSettings();
	expect(plugin.settingsStore.hasPendingSave).toBe(false);
	expect(plugin.providerRegistry.getProviders()).toEqual([]);
	expect(reconstruction).toHaveBeenCalledTimes(1);
});

test("startup cannot register UI or providers after unloading during the settings read", async () => {
	const { plugin, adapter } = createPlugin(currentData);
	let resolve!: (data: string) => void;
	adapter.read.mockReturnValue(new Promise(done => { resolve = done; }));
	const reconstruction = jest.spyOn(plugin, "loadEntityProviders");
	const loading = plugin.onload();
	await tick();
	expect(adapter.read).toHaveBeenCalledTimes(1);
	plugin.onunload();
	resolve(JSON.stringify(currentData));
	await loading;
	expect(plugin.addSettingTab).not.toHaveBeenCalled();
	expect(plugin.registerEditorSuggest).not.toHaveBeenCalled();
	expect(reconstruction).not.toHaveBeenCalled();
	expect(dataWrites(plugin)).toHaveLength(0);
});

test("schema migration backs up original private data in the plugin directory before saving", async () => {
	const original = { unknown: { private: [false, 0] }, providerSettings: [{ ...TestProvider.getDefaultSettings(), enabled: false }] };
	const { plugin, adapter } = createPlugin(original);
	await plugin.onload();
	await plugin.saveSettings();
	expect(adapter.write).toHaveBeenCalledTimes(2);
	expect(adapter.write.mock.calls[0][0]).toMatch(/^config\/plugins\/entities\/data.before-settings-v1-[a-f0-9]{32}\.json$/);
	expect(JSON.parse(adapter.write.mock.calls[0][1])).toEqual(original);
	expect(adapter.write.mock.calls[1][0]).toBe("config/plugins/entities/data.json");
	const restarted = createPlugin(dataWrites(plugin)[0]);
	await restarted.plugin.onload();
	await restarted.plugin.saveSettings();
	expect(restarted.adapter.write).not.toHaveBeenCalled();
	expect(dataWrites(restarted.plugin)).toHaveLength(0);
});

test.each(["../plugins/entities", "/config/plugins/entities", "config/plugins/../entities", "config/plugins/entities/notes", "config/plugins/"])(
	"unsafe backup directory stays read-only: %s", async dir => {
		const { plugin, adapter } = createPlugin({ providerSettings: [] }, dir);
		await plugin.onload();
		await plugin.saveSettings();
		plugin.onunload();
		expect(plugin.settingsStore.isReadOnly).toBe(true);
		expect(plugin.settingsStore.loadError).toBeDefined();
		expect(adapter.write).not.toHaveBeenCalled();
		expect(dataWrites(plugin)).toHaveLength(0);
	}
);

test("backup collision and write failure never reach migration persistence, even on unload", async () => {
	for (const failure of ["collision", "disk full"]) {
		const { plugin, adapter } = createPlugin({ providerSettings: [] });
		if (failure === "collision") adapter.stat.mockResolvedValue({ type: "file", mtime: 0, ctime: 0, size: 0 });
		else adapter.write.mockRejectedValue(new Error(failure));
		await plugin.onload();
		await plugin.saveSettings();
		plugin.onunload();
		expect(plugin.settingsStore.loadError).toBeDefined();
		expect(dataWrites(plugin)).toHaveLength(0);
	}
});

test("first install needs no backup and can save new providers", async () => {
	const { plugin, adapter } = createPlugin(undefined);
	await plugin.onload();
	expect(plugin.settingsStore.isReadOnly).toBe(false);
	plugin.settingsStore.addProvider(TestProvider.getDefaultSettings());
	await plugin.saveSettings();
	expect(adapter.write.mock.calls.every(([path]) => path.endsWith("/data.json"))).toBe(true);
	expect(dataWrites(plugin)).toHaveLength(1);
});

test("load errors expose only recovery controls and retry reloads repaired settings", async () => {
	const { plugin, app, adapter } = createPlugin({ schemaVersion: 99, providerSettings: [] });
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin);
	tab.display();
	expect(mockRows.map(row => row.name)).toEqual(["Settings could not be loaded"]);
	expect(Notice).toHaveBeenCalled();
	await plugin.saveSettings();
	expect(adapter.write).not.toHaveBeenCalled();
	expect(dataWrites(plugin)).toHaveLength(0);
	jest.mocked(plugin.app.vault.adapter.read).mockResolvedValue(JSON.stringify(currentData));
	await mockRows[0].controls[0].click();
	expect(plugin.providerRegistry.getProviders().map(item => item.providerInstanceId)).toEqual(["a", "b"]);
	expect(mockRows.some(row => row.name === "Add new provider")).toBe(true);
});

test("save errors expose retry without discarding the visible edit", async () => {
	const { plugin, app } = createPlugin(currentData);
	await plugin.onload();
	jest.mocked(plugin.app.vault.adapter.write).mockRejectedValueOnce(new Error("disk full"));
	plugin.settingsStore.updateProvider("a", { icon: "star" });
	await plugin.saveSettings();
	const tab = new EntitiesSettingTab(app, plugin);
	tab.display();
	expect(mockRows[0].name).toBe("Settings have not been saved");
	expect(plugin.settings.providerSettings[0].icon).toBe("star");
	await mockRows[0].controls[0].click();
	expect(plugin.settingsStore.saveError).toBeUndefined();
	expect(mockRows.some(row => row.name === "Settings have not been saved")).toBe(false);
});

test("recipe collection conflicts remain rejected by provider ID", async () => {
	const recipes = [
		{ engine: "core" as const, templatePath: "Core.md", entityName: "Person" },
		{ engine: "templater" as const, templatePath: "Project.md", entityName: "Project" },
	];
	const { plugin, app } = createPlugin({ schemaVersion: 1, providerSettings: [
		{ ...config("a"), entityCreationTemplates: recipes }, config("b"),
	] });
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin);
	tab.display(); const first = filterEdits.get("a")!;
	new EntitiesSettingTab(app, plugin).display(); const stale = filterEdits.get("a")!;
	plugin.settingsStore.reorderProviders(["b", "a"]);
	first(draft => { draft.entityCreationTemplates![1].entityName = "Updated project"; });
	const canonical = plugin.settings;
	stale(draft => { draft.entityCreationTemplates![0].entityName = "Stale person"; });
	expect(plugin.settings).toEqual(canonical);
	expect(plugin.settings.providerSettings[1].entityCreationTemplates![1].entityName).toBe("Updated project");
	expect(EntitiesNotice).toHaveBeenCalledWith(expect.stringContaining("Your last edit was not applied"), "alert-triangle", 10000);
});

test.each(["edit another filter", "delete a filter"])("concurrent collection change is rejected and reopening recovers: %s", async action => {
	const entityFilters = [
		{ type: "include", property: "first", value: "old first" },
		{ type: "include", property: "second", value: "old second" },
	];
	const { plugin, app } = createPlugin({ schemaVersion: 1, providerSettings: [{ ...config("a"), entityFilters }] });
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin);
	tab.display();
	const firstDraft = filterEdits.get("a")!;
	new EntitiesSettingTab(app, plugin).display();
	const secondDraft = filterEdits.get("a")!;
	firstDraft(draft => {
		if (action === "delete a filter") draft.entityFilters!.splice(0, 1);
		else draft.entityFilters![0].value = "first edit";
	});
	const firstState = plugin.settings;
	secondDraft(draft => { draft.entityFilters![1].value = "second edit"; });
	expect(plugin.settings).toEqual(firstState);
	expect(EntitiesNotice).toHaveBeenCalledWith(expect.stringContaining("Your last edit was not applied"), "alert-triangle", 10000);
	// The rejected view cannot silently retry its stale collection.
	secondDraft(draft => { draft.label = "stale retry"; });
	expect(plugin.settings).toEqual(firstState);
	// Reopening reads canonical data and permits a deliberate new edit.
	tab.display();
	filterEdits.get("a")!(draft => { draft.entityFilters!.find(filter => filter.property === "second")!.value = "second edit"; });
	await plugin.saveSettings();
	const expected = action === "delete a filter" ? [{ property: "second", value: "second edit" }] : [
		{ property: "first", value: "first edit" }, { property: "second", value: "second edit" },
	];
	expect(dataWrites(plugin).at(-1).providerSettings[0].entityFilters).toMatchObject(expected);
});

test("same-field scalar conflicts are visible; a fresh view can deliberately replace the value", async () => {
	const { plugin, app } = createPlugin(currentData);
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin);
	tab.display();
	const stale = edits.get("a")!;
	new EntitiesSettingTab(app, plugin).display();
	edits.get("a")!("newest");
	stale("older draft");
	expect(plugin.settings.providerSettings[0]).toMatchObject({ label: "newest" });
	expect(EntitiesNotice).toHaveBeenCalled();
	tab.display();
	edits.get("newest")!("deliberate replacement");
	await plugin.saveSettings();
	expect(plugin.settings.providerSettings[0]).toMatchObject({ label: "deliberate replacement" });
});

test("automatic retry removes only the failed-save warning, retaining focused input rows", async () => {
	const { plugin, adapter } = createPlugin(currentData);
	await plugin.onload();
	const tab = jest.mocked(plugin.addSettingTab).mock.calls[0][0] as EntitiesSettingTab;
	tab.display();
	adapter.write.mockRejectedValueOnce(new Error("disk full"));
	edits.get("a")!("first edit");
	expect(await plugin.saveSettings()).toBe(false);
	expect(mockRows.some(row => row.name === "Settings have not been saved")).toBe(true);
	const focusedRow = mockRows.find(row => row.name === "Provider #1");
	const display = jest.spyOn(tab, "display");
	edits.get("first edit")!("retry via ordinary edit");
	expect(await plugin.saveSettings()).toBe(true);
	expect(mockRows.some(row => row.name === "Settings have not been saved")).toBe(false);
	expect(mockRows).toContain(focusedRow);
	expect(display).not.toHaveBeenCalled();
});

test.each(["{private broken JSON", "null", "undefined"])("raw invalid saved content stays protected: %s", async raw => {
	const { plugin, adapter, files } = createPlugin(currentData);
	files.set("config/plugins/entities/data.json", raw);
	await plugin.onload();
	expect(plugin.settingsStore.isReadOnly).toBe(true);
	expect(plugin.settingsStore.addProvider(TestProvider.getDefaultSettings())).toBeUndefined();
	await plugin.saveSettings();
	await plugin.loadSettings();
	plugin.onunload();
	expect(adapter.write).not.toHaveBeenCalled();
	expect(files.get("config/plugins/entities/data.json")).toBe(raw);
	expect(Notice).not.toHaveBeenCalledWith(expect.stringContaining("private broken JSON"), expect.anything());
	expect(plugin.loadData).not.toHaveBeenCalled();
	expect(plugin.saveData).not.toHaveBeenCalled();
});

test("actual adapter read and stat errors remain protected and retryable", async () => {
	for (const method of ["stat", "read"] as const) {
		const { plugin, adapter } = createPlugin(currentData);
		adapter[method].mockRejectedValueOnce(new Error("permission denied"));
		await plugin.onload();
		expect(plugin.settingsStore.isReadOnly).toBe(true);
		expect(await plugin.saveSettings()).toBe(false);
		expect(adapter.write).not.toHaveBeenCalled();
		expect(await plugin.loadSettings()).toBe(true);
		expect(plugin.settingsStore.isReadOnly).toBe(false);
	}
});

test("distinct plugin instances wait for old disk writes before reading and keep the newest edit", async () => {
	const { plugin: old, app, adapter, files } = createPlugin(currentData);
	await old.onload();
	let finish!: () => void;
	adapter.write.mockImplementationOnce((path, raw) => new Promise<void>(done => {
		finish = () => { files.set(path, raw); done(); };
	}));
	old.settingsStore.updateProvider("a", { icon: "old edit" });
	await tick();
	old.onunload();
	const next = instantiatePlugin(app);
	const loading = next.onload();
	await tick();
	expect(adapter.read).toHaveBeenCalledTimes(1);
	expect(next.settingsStore.isReadOnly).toBe(true);
	finish();
	await loading;
	expect(next.settings.providerSettings[0].icon).toBe("old edit");
	next.settingsStore.updateProvider("a", { icon: "newest edit" });
	await next.saveSettings();
	expect(JSON.parse(files.get("config/plugins/entities/data.json")!).providerSettings[0].icon).toBe("newest edit");
});

test("dirty predecessor failure blocks new reads and writes until explicit retry succeeds", async () => {
	const { plugin: old, app, adapter, files } = createPlugin(currentData);
	await old.onload();
	adapter.write.mockRejectedValue(new Error("disk full"));
	old.settingsStore.updateProvider("a", { icon: "unsaved previous edit" });
	await old.saveSettings();
	old.onunload();
	const next = instantiatePlugin(app);
	await next.onload();
	expect(next.settingsStore.loadError?.message).toContain("previous plugin instance");
	expect(next.settingsStore.isReadOnly).toBe(true);
	expect(adapter.read).toHaveBeenCalledTimes(1);
	expect(next.settingsStore.updateProvider("a", { icon: "must not replace" })).toBe(false);
	adapter.write.mockImplementation(async (path, raw) => { files.set(path, raw); });
	expect(await next.loadSettings()).toBe(true);
	expect(next.settings.providerSettings[0].icon).toBe("unsaved previous edit");
	next.settingsStore.updateProvider("a", { icon: "new edit" });
	await next.saveSettings();
	expect(JSON.parse(files.get("config/plugins/entities/data.json")!).providerSettings[0].icon).toBe("new edit");
});

test.each([true, false])("A→B→C preserves the entire barrier when B unloads or is superseded (unload=%s)", async unloadB => {
	const { plugin: a, app, adapter, files } = createPlugin(currentData);
	await a.onload();
	let finish!: () => void;
	adapter.write.mockImplementationOnce((path, raw) => new Promise<void>(done => {
		finish = () => { files.set(path, raw); done(); };
	}));
	a.settingsStore.updateProvider("a", { icon: "A pending" });
	await tick();
	a.onunload();
	const b = instantiatePlugin(app);
	const loadingB = b.onload();
	await tick();
	if (unloadB) b.onunload();
	const c = instantiatePlugin(app);
	const loadingC = c.onload();
	await tick();
	expect(adapter.read).toHaveBeenCalledTimes(1);
	finish();
	await Promise.all([loadingB, loadingC]);
	expect(b.addSettingTab).not.toHaveBeenCalled();
	expect(b.registerEditorSuggest).not.toHaveBeenCalled();
	expect(adapter.read).toHaveBeenCalledTimes(2);
	expect(c.settings.providerSettings[0].icon).toBe("A pending");
	c.settingsStore.updateProvider("a", { icon: "C newest" });
	await c.saveSettings();
	expect(JSON.parse(files.get("config/plugins/entities/data.json")!).providerSettings[0].icon).toBe("C newest");
});

test("unload while waiting registers no UI and leaves persistence safe for a later start", async () => {
	const { plugin: a, app, adapter, files } = createPlugin(currentData);
	await a.onload();
	let finish!: () => void;
	adapter.write.mockImplementationOnce((path, raw) => new Promise<void>(done => {
		finish = () => { files.set(path, raw); done(); };
	}));
	a.settingsStore.updateProvider("a", { icon: "pending" });
	await tick();
	a.onunload();
	const b = instantiatePlugin(app);
	const loading = b.onload();
	b.onunload();
	finish();
	await loading;
	expect(b.addSettingTab).not.toHaveBeenCalled();
	expect(b.registerEditorSuggest).not.toHaveBeenCalled();
	expect(adapter.read).toHaveBeenCalledTimes(1);
	expect(dataWrites(b)).toHaveLength(1);
});

test("unrelated apps and plugin IDs are not blocked by a pending settings drain", async () => {
	const { plugin: old, app, adapter, files } = createPlugin(currentData);
	await old.onload();
	let finish!: () => void;
	adapter.write.mockImplementationOnce(() => new Promise<void>(done => { finish = done; }));
	old.settingsStore.updateProvider("a", { icon: "pending" });
	await tick();
	old.onunload();
	const separateApp = createPlugin(currentData).plugin;
	await separateApp.onload();
	expect(separateApp.addSettingTab).toHaveBeenCalled();
	files.set("config/plugins/other/data.json", JSON.stringify(currentData));
	const separateId = instantiatePlugin(app, "config/plugins/other", "other");
	await separateId.onload();
	expect(separateId.addSettingTab).toHaveBeenCalled();
	finish();
	await old.saveSettings();
});


test("a conflicted provider modal closes and reopening reloads canonical filters", async () => {
	const entityFilters = [
		{ type: "include", property: "first", value: "old first" },
		{ type: "include", property: "second", value: "old second" },
	];
	const { plugin, app } = createPlugin({ schemaVersion: 1, providerSettings: [{ ...config("a"), entityFilters }] });
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin);
	const open = jest.spyOn(ProviderSettingsModal.prototype, "open").mockImplementation(function (this: ProviderSettingsModal) { this.onOpen(); });
	const close = jest.spyOn(ProviderSettingsModal.prototype, "close").mockImplementation(function (this: ProviderSettingsModal) { this.onClose(); });
	try {
		tab.display();
		const rowEdit = filterEdits.get("a")!;
		mockRows.find(row => row.name === "Provider #1")!.controls.find(control => control.text === "settings")!.click();
		const modalEdit = filterEdits.get("a")!;
		rowEdit(draft => { draft.entityFilters![0].value = "row edit"; });
		modalEdit(draft => { draft.entityFilters![1].value = "stale modal edit"; });
		expect(close).toHaveBeenCalledTimes(1);
		expect(plugin.settings.providerSettings[0]).toMatchObject({ entityFilters: [{ value: "row edit" }, { value: "old second" }] });
		mockRows.find(row => row.name === "Provider #1")!.controls.find(control => control.text === "settings")!.click();
		filterEdits.get("a")!(draft => { draft.entityFilters![1].value = "recovered edit"; });
		await plugin.saveSettings();
		expect(plugin.settings.providerSettings[0]).toMatchObject({ entityFilters: [{ value: "row edit" }, { value: "recovered edit" }] });
	} finally {
		open.mockRestore();
		close.mockRestore();
	}
});

test.each(["EACCES", "EIO"])("stat failure protects existing data even when host exists silently returns false: %s", async code => {
	const { plugin, adapter, files } = createPlugin(currentData);
	const original = files.get("config/plugins/entities/data.json");
	const failure = Object.assign(new Error("filesystem unavailable"), { code });
	// Desktop access/mobile stat errors are swallowed by the host exists wrapper.
	adapter.exists.mockImplementation(() => Promise.reject(failure).then(() => true, () => false));
	expect(await adapter.exists("config/plugins/entities/data.json")).toBe(false);
	adapter.exists.mockClear();
	adapter.stat.mockRejectedValueOnce(failure);
	await plugin.onload();
	expect(plugin.settingsStore.isReadOnly).toBe(true);
	expect(plugin.settingsStore.loadError).toBe(failure);
	expect(adapter.exists).not.toHaveBeenCalled();
	expect(adapter.read).not.toHaveBeenCalled();
	expect(plugin.settingsStore.addProvider(TestProvider.getDefaultSettings())).toBeUndefined();
	expect(await plugin.saveSettings()).toBe(false);
	expect(adapter.write).not.toHaveBeenCalled();
	expect(files.get("config/plugins/entities/data.json")).toBe(original);
	// Permission recovery alone cannot enable edits: explicit retry reads existing data.
	expect(plugin.settingsStore.addProvider(TestProvider.getDefaultSettings())).toBeUndefined();
	expect(await plugin.loadSettings()).toBe(true);
	plugin.settingsStore.addProvider(TestProvider.getDefaultSettings());
	await plugin.saveSettings();
	expect(dataWrites(plugin).at(-1).providerSettings).toMatchObject([config("a"), config("b"), { providerTypeID: "test" }]);
});

test.each(["EACCES", "EIO"])("backup stat failure cannot be treated as a free backup path: %s", async code => {
	const original = { providerSettings: [TestProvider.getDefaultSettings()], privateField: false };
	const { plugin, adapter, files } = createPlugin(original);
	const stat = adapter.stat.getMockImplementation()!;
	const failure = Object.assign(new Error("backup filesystem unavailable"), { code });
	adapter.exists.mockImplementation(() => Promise.reject(failure).then(() => true, () => false));
	adapter.stat.mockImplementation(path => path.includes("data.before-settings-v1-") ? Promise.reject(failure) : stat(path));
	await plugin.onload();
	expect(plugin.settingsStore.isReadOnly).toBe(true);
	expect(plugin.settingsStore.loadError).toBe(failure);
	expect(adapter.exists).not.toHaveBeenCalled();
	expect(plugin.settingsStore.addProvider(TestProvider.getDefaultSettings())).toBeUndefined();
	await plugin.saveSettings();
	plugin.onunload();
	expect(adapter.write).not.toHaveBeenCalled();
	expect(JSON.parse(files.get("config/plugins/entities/data.json")!)).toEqual(original);
});

test("only a literal null stat result permits first-install behavior", async () => {
	const { plugin, adapter } = createPlugin(currentData);
	adapter.stat.mockResolvedValue(undefined as unknown as null);
	await plugin.onload();
	expect(plugin.settingsStore.isReadOnly).toBe(true);
	expect(adapter.read).not.toHaveBeenCalled();
	expect(adapter.write).not.toHaveBeenCalled();
});


test.each(["hide", "rebuild", "unload"])("a retained settings draft cannot save after its own view %s", async reason => {
	const { plugin, app } = createPlugin(currentData);
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin);
	tab.display();
	const retained = edits.get("a")!;
	if (reason === "hide") tab.hide();
	if (reason === "rebuild") tab.display();
	if (reason === "unload") plugin.onunload();
	retained("detached edit");
	await plugin.saveSettings();
	expect(plugin.settings.providerSettings[0].label).toBe("a");
});


test("a retained settings button cannot rebuild or mutate a hidden view", async () => {
	const { plugin, app } = createPlugin(currentData);
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin); tab.display();
	const buttons = mockRows.flatMap(row => row.controls);
	const display = jest.spyOn(tab, "display");
	tab.hide();
	buttons.forEach(button => { void button.click(); });
	await tick();
	expect(display).not.toHaveBeenCalled();
	expect(plugin.settings.providerSettings.map(p => p.providerInstanceId)).toEqual(["a", "b"]);
});
