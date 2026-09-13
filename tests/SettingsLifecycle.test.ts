import { App, PluginManifest, Notice } from "obsidian";
import Entities from "../src/main";
import { EntitiesSettingTab, ProviderSettingsModal } from "../src/EntitiesSettings";
import { EntityProvider, EntityProviderUserSettings } from "../src/Providers/EntityProvider";
import { IconPickerModal } from "../src/userComponents";

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
		Plugin: class {
			constructor(public app: App, public manifest: PluginManifest) {}
			loadData = jest.fn();
			saveData = jest.fn().mockResolvedValue(undefined);
			addSettingTab = jest.fn();
			registerEditorSuggest = jest.fn();
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
jest.mock("../src/entitiesUtilities", () => ({}));
jest.mock("../src/EntitiesSuggestor", () => ({ EntitiesSuggestor: class {} }));
jest.mock("../src/Providers/FolderEntityProvider", () => ({}));
jest.mock("../src/Providers/DataviewEntityProvider", () => ({}));
jest.mock("../src/Providers/DateEntityProvider", () => ({}));
jest.mock("../src/Providers/HelperActionsProvider", () => ({}));
jest.mock("../src/Providers/CharacterProvider", () => ({}));
jest.mock("../src/Providers/TemplateProvider", () => ({}));
jest.mock("../src/Providers/MetadataMenuProvider", () => ({}));

interface TestSettings extends EntityProviderUserSettings { label: string }
const edits = new Map<string, (label: string) => void>();
class TestProvider extends EntityProvider<TestSettings> {
	static readonly providerTypeID = "test";
	static getDescription() { return "Test provider"; }
	static getDefaultSettings() { return { providerTypeID: "test", enabled: true, icon: "box", label: "" }; }
	getDefaultSettings() { return TestProvider.getDefaultSettings(); }
	getEntityList() { return []; }
	static buildSummarySetting(_setting: unknown, draft: TestSettings, save: (next: TestSettings) => void) {
		edits.set(draft.label, label => { draft.label = label; save(draft); });
	}
}

function createPlugin(data: unknown, dir = "config/plugins/entities") {
	const adapter = { exists: jest.fn().mockResolvedValue(false), write: jest.fn().mockResolvedValue(undefined) };
	const app = { vault: { configDir: "config", adapter } } as unknown as App;
	const plugin = new Entities(app, { dir } as PluginManifest);
	jest.mocked(plugin.loadData).mockResolvedValue(data);
	jest.spyOn(plugin, "registerEntityProviders").mockImplementation(() => {
		plugin.providerRegistry.registerProviderType(TestProvider);
	});
	return { plugin, adapter, app };
}

const config = (id: string) => ({ ...TestProvider.getDefaultSettings(), providerInstanceId: id, label: id });
const currentData = { schemaVersion: 1, providerSettings: [config("a"), config("b")] };

beforeEach(() => { mockRows.length = 0; edits.clear(); jest.clearAllMocks(); });

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
	expect(jest.mocked(plugin.saveData).mock.calls.at(-1)![0].providerSettings).toEqual(plugin.settings.providerSettings);
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
	tab.display();
	lateEdit("new label");
	await plugin.saveSettings();
	expect(plugin.settings.providerSettings[0]).toMatchObject({ label: "new label", icon: "new icon" });
});

test("successive icon pickers cannot make an older row draft revert the latest icon", async () => {
	const { plugin, app } = createPlugin(currentData);
	await plugin.onload();
	const tab = new EntitiesSettingTab(app, plugin);
	tab.display();
	const lateEdit = edits.get("a")!;
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
	const { plugin } = createPlugin(null);
	let resolve!: (data: unknown) => void;
	jest.mocked(plugin.loadData).mockReturnValue(new Promise(done => { resolve = done; }));
	const reconstruction = jest.spyOn(plugin, "loadEntityProviders");
	const loading = plugin.onload();
	plugin.onunload();
	resolve(currentData);
	await loading;
	expect(plugin.addSettingTab).not.toHaveBeenCalled();
	expect(plugin.registerEditorSuggest).not.toHaveBeenCalled();
	expect(reconstruction).not.toHaveBeenCalled();
	expect(plugin.saveData).not.toHaveBeenCalled();
});

test("schema migration backs up original private data in the plugin directory before saving", async () => {
	const original = { unknown: { private: [false, 0] }, providerSettings: [{ ...TestProvider.getDefaultSettings(), enabled: false }] };
	const { plugin, adapter } = createPlugin(original);
	await plugin.onload();
	await plugin.saveSettings();
	expect(adapter.write).toHaveBeenCalledTimes(1);
	expect(adapter.write.mock.calls[0][0]).toMatch(/^config\/plugins\/entities\/data.before-settings-v1-[a-f0-9]{32}\.json$/);
	expect(JSON.parse(adapter.write.mock.calls[0][1])).toEqual(original);
	expect(adapter.write.mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(plugin.saveData).mock.invocationCallOrder[0]);
	const restarted = createPlugin(jest.mocked(plugin.saveData).mock.calls[0][0]);
	await restarted.plugin.onload();
	await restarted.plugin.saveSettings();
	expect(restarted.adapter.write).not.toHaveBeenCalled();
	expect(restarted.plugin.saveData).not.toHaveBeenCalled();
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
		expect(plugin.saveData).not.toHaveBeenCalled();
	}
);

test("backup collision and write failure never reach migration persistence, even on unload", async () => {
	for (const failure of ["collision", "disk full"]) {
		const { plugin, adapter } = createPlugin({ providerSettings: [] });
		if (failure === "collision") adapter.exists.mockResolvedValue(true);
		else adapter.write.mockRejectedValue(new Error(failure));
		await plugin.onload();
		await plugin.saveSettings();
		plugin.onunload();
		expect(plugin.settingsStore.loadError).toBeDefined();
		expect(plugin.saveData).not.toHaveBeenCalled();
	}
});

test("first install needs no backup and can save new providers", async () => {
	const { plugin, adapter } = createPlugin(null, "");
	await plugin.onload();
	expect(plugin.settingsStore.isReadOnly).toBe(false);
	plugin.settingsStore.addProvider(TestProvider.getDefaultSettings());
	await plugin.saveSettings();
	expect(adapter.write).not.toHaveBeenCalled();
	expect(plugin.saveData).toHaveBeenCalledTimes(1);
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
	expect(plugin.saveData).not.toHaveBeenCalled();
	jest.mocked(plugin.loadData).mockResolvedValue(currentData);
	await mockRows[0].controls[0].click();
	expect(plugin.providerRegistry.getProviders().map(item => item.providerInstanceId)).toEqual(["a", "b"]);
	expect(mockRows.some(row => row.name === "Add new provider")).toBe(true);
});

test("save errors expose retry without discarding the visible edit", async () => {
	const { plugin, app } = createPlugin(currentData);
	await plugin.onload();
	jest.mocked(plugin.saveData).mockRejectedValueOnce(new Error("disk full"));
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
