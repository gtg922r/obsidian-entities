import { App, PluginManifest, Notice } from "obsidian";
import Entities from "../src/main";
import { EntityProvider, EntityProviderUserSettings } from "../src/Providers/EntityProvider";
import { EntitiesNotice } from "../src/userComponents";

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
	expect(next.entitySettings.providerSettings[0].icon).toBe("old edit");
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
	expect(next.entitySettings.providerSettings[0].icon).toBe("unsaved previous edit");
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
	expect(c.entitySettings.providerSettings[0].icon).toBe("A pending");
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


test.each(["inputs", "store", "suggestor", "registry"] as const)("unload attempts every cleanup when %s cleanup throws", async target => {
	const { plugin } = createPlugin(currentData);
	await plugin.onload();
	const failure = new Error(`synthetic ${target} cleanup failure`);
	const errors = jest.spyOn(console, "error").mockImplementation(() => {});
	const cleanups = {
		inputs: jest.spyOn(plugin.inputSuggestions, "dispose"),
		store: jest.spyOn(plugin.settingsStore, "close"),
		suggestor: jest.spyOn(plugin.suggestor, "dispose"),
		registry: jest.spyOn(plugin.providerRegistry, "resetProviders"),
	};
	cleanups[target].mockImplementationOnce(() => { throw failure; });
	try {
		expect(() => plugin.onunload()).not.toThrow();
		for (const cleanup of Object.values(cleanups)) expect(cleanup).toHaveBeenCalledTimes(1);
		await tick();
		expect(errors.mock.calls.some(args => args.includes(failure))).toBe(true);
		expect(Notice).not.toHaveBeenCalled();
		expect(EntitiesNotice).not.toHaveBeenCalled();
	} finally {
		Object.values(cleanups).forEach(cleanup => cleanup.mockRestore());
		plugin.inputSuggestions.dispose();
		await plugin.settingsStore.close();
		plugin.suggestor.dispose(); plugin.providerRegistry.resetProviders();
		errors.mockRestore();
	}
});
