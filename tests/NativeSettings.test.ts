import { App, SettingDefinitionItem, TFile, TFolder } from "obsidian";
import type Entities from "../src/main";
import { EntitiesSettingTab } from "../src/EntitiesSettings";
import { SettingsStore } from "../src/SettingsStore";
import { FolderEntityProvider } from "../src/Providers/FolderEntityProvider";
import { DataviewEntityProvider } from "../src/Providers/DataviewEntityProvider";
import { TemplateEntityProvider } from "../src/Providers/TemplateProvider";
import { HelperEntityProvider } from "../src/Providers/HelperActionsProvider";
import { DateEntityProvider } from "../src/Providers/DateEntityProvider";
import { CharacterProvider } from "../src/Providers/CharacterProvider";
import { MetadataMenuProvider } from "../src/Providers/MetadataMenuProvider";
import { InputSuggestScope } from "../src/ui/inputSuggestLifecycle";
import { NativeSettingsLifetime } from "../src/ui/nativeSettingsLifetime";
import { FrontmatterKeySuggest } from "../src/ui/FrontmatterKeySuggest";
import { EntitiesNotice, IconPickerModal } from "../src/userComponents";
import { control, nativeTab, pageNames, row } from "./nativeSettingsHostMock";
import { installNativeDom, modals } from "./nativeSettingsTestSupport";
import { createKeymap, poppers, suggestionRows, trackListeners } from "./inputSuggestHostMock";

jest.mock("obsidian", () => ({
	...jest.requireActual("./__mocks__/obsidian"),
	Setting: jest.requireActual("./nativeSettingsHostMock").NativeSetting,
	PluginSettingTab: jest.requireActual("./nativeSettingsHostMock").NativeTab,
	Modal: jest.requireActual("./nativeSettingsTestSupport").NativeModal,
	Notice: class {}, moment: jest.requireActual("moment"),
	getIconIds: () => ["star", "box"], getIcon: () => document.createElementNS("http://www.w3.org/2000/svg", "svg"),
	sanitizeHTMLToDom: (text: string) => text,
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "") || "/",
}));
jest.mock("../src/userComponents", () => ({ ...jest.requireActual("../src/userComponents"), EntitiesNotice: jest.fn() }));
jest.mock("@popperjs/core", () => ({ createPopper: jest.requireActual("./inputSuggestHostMock").createPopper }));

const types = [FolderEntityProvider, DataviewEntityProvider, TemplateEntityProvider, HelperEntityProvider, DateEntityProvider, CharacterProvider, MetadataMenuProvider];
const scopes: InputSuggestScope[] = [];
let restore: () => void;
beforeEach(() => { restore = installNativeDom(document); modals.length = 0; poppers.length = 0; jest.clearAllMocks(); });
afterEach(() => { scopes.splice(0).forEach(scope => scope.dispose()); document.body.replaceChildren(); restore(); jest.useRealTimers(); });
const filter = (property: string, value = "yes") => ({ type: "include" as const, property, value });
const recipes = [{ engine: "disabled", templatePath: "First.md", entityName: "First", private: { keep: true } }, { engine: "templater", templatePath: "Second.md", entityName: "Second", private: "tail" }];

async function harness(Provider = FolderEntityProvider as typeof types[number], overrides: Record<string, unknown> = {}) {
	const file = Object.assign(new TFile(), { path: "People/Bob.md", basename: "Bob" });
	const child = Object.assign(new TFile(), { path: "People/Sub/Child.md", basename: "Child" });
	const sub = Object.assign(new TFolder(), { path: "People/Sub", children: [child] });
	const folder = Object.assign(new TFolder(), { path: "People", children: [file, sub] });
	const root = Object.assign(new TFolder(), { path: "/", children: [folder] });
	const pages = jest.fn((query: string) => { if (query === "[") throw new Error("bad source"); return query === "empty" ? [] : [{ file: { path: file.path } }, { file: { path: "Missing.md" } }]; });
	const integrations: Record<string, unknown> = { dataview: { api: { pages } } };
	const keymap = createKeymap();
	const app = { keymap, activeDocument: document, plugins: { getPlugin: (id: string) => integrations[id] }, vault: {
		getRoot: () => root, getFolderByPath: (path: string) => path === "People" ? folder : path === "/" ? root : null,
		getAbstractFileByPath: (path: string) => path === file.path ? file : null, getMarkdownFiles: () => [file], getAllLoadedFiles: () => [root, folder],
	}, metadataCache: { getFileCache: () => ({ frontmatter: { yes: "yes", ldap: "person" } }) } } as unknown as App;
	const write = jest.fn(async (_value: unknown) => {});
	const store = new SettingsStore(write, async () => {}, () => Provider.getDefaultSettings());
	await store.load(async () => JSON.parse(JSON.stringify({ schemaVersion: 1, providerSettings: [
		{ ...Provider.getDefaultSettings(), providerInstanceId: "a", path: "People", ...overrides },
		{ ...Provider.getDefaultSettings(), providerInstanceId: "b", path: "People" },
	] })));
	const owner = new InputSuggestScope(); scopes.push(owner);
	const plugin = { app, inputSuggestions: owner, settingsStore: store, loadEntityProviders: jest.fn(), saveSettings: () => store.flush(), saveData: jest.fn(),
		providerRegistry: { getProviderClasses: () => new Map(types.map(type => [type.providerTypeID, type])) },
	} as unknown as Entities;
	const tab = new EntitiesSettingTab(app, plugin);
	const open = (target = tab, index = 0) => { nativeTab(target).show([pageNames(target)[index]]); return target; };
	return { tab, store, write, plugin, app, owner, pages, integrations, open, keymap };
}

function names(items: SettingDefinitionItem[]): string[] {
	return items.flatMap(item => "type" in item ? [("name" in item ? item.name : item.heading) ?? "", ...names(item.items ?? [])] : [item.name]);
}
const input = (element: HTMLInputElement, value: string, composing = false) => {
	element.value = value; element.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: composing }));
};
async function tick() { await Promise.resolve(); await Promise.resolve(); }

test("provider page rows remain editable outside the detached top-level tab container", async () => {
	const h = await harness(); nativeTab(h.tab).show(); h.open(); await tick();
	expect(h.tab.containerEl.isConnected).toBe(false);
	expect(control(h.tab, "Folder path").inputEl.isConnected).toBe(true);
	input(control(h.tab, "Folder path").inputEl, "native page edit");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "native page edit" });
	row(h.tab, "Remove provider").settingEl.remove(); await tick();
	input(control(h.tab, "Folder path").inputEl, "connected sibling edit");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "connected sibling edit" });
	h.tab.hide(); h.open(); await tick();
	input(control(h.tab, "Folder path").inputEl, "reopened page edit");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "reopened page edit" });
});

test("late cleanup of an unmoved prior row cannot reclaim a fresh destination render", async () => {
	jest.useFakeTimers(); const owner = new InputSuggestScope(); scopes.push(owner);
	const oldRoot = document.createElement("div"); document.body.append(oldRoot);
	const frame = document.createElement("iframe"); document.body.append(frame);
	const doc = frame.contentDocument!; const newRoot = doc.createElement("div"); doc.body.append(newRoot);
	const rebuild = jest.fn(); const lifetime = new NativeSettingsLifetime(() => oldRoot, owner, rebuild);
	const old = lifetime.render(oldRoot, () => {}); const fresh = lifetime.render(newRoot, () => {});
	old.scope.dispose(); newRoot.append(doc.createElement("span")); await tick();
	await new Promise<void>(resolve => doc.defaultView!.setTimeout(resolve, 0)); jest.runOnlyPendingTimers();
	const action = jest.fn(); fresh.scope.guard(action)();
	expect(action).toHaveBeenCalledTimes(1); expect(rebuild).not.toHaveBeenCalled();
	lifetime.dispose(); frame.remove();
});

test("late cleanup of an adopted prior row cannot reclaim the fresh current render", async () => {
	const owner = new InputSuggestScope(); scopes.push(owner);
	const oldRoot = document.createElement("div"); document.body.append(oldRoot);
	const frame = document.createElement("iframe"); document.body.append(frame); const doc = frame.contentDocument!;
	const rebuild = jest.fn(); const lifetime = new NativeSettingsLifetime(() => oldRoot, owner, rebuild);
	const old = lifetime.render(oldRoot, () => {}); doc.body.append(doc.adoptNode(oldRoot));
	const freshRoot = document.createElement("div"); document.body.append(freshRoot);
	const fresh = lifetime.render(freshRoot, () => {});
	old.scope.dispose(); freshRoot.append(document.createElement("span")); await tick();
	await new Promise<void>(resolve => doc.defaultView!.setTimeout(resolve, 0));
	const action = jest.fn(); fresh.scope.guard(action)();
	expect(action).toHaveBeenCalledTimes(1); expect(rebuild).not.toHaveBeenCalled();
	lifetime.dispose(); frame.remove();
});

// Every meaningful field is a real native definition; generation/search create no render sessions or writes.
test.each(types.map(type => [type.providerTypeID, type] as const))("%s definitions are stable, searchable and free of render work", async (_type, Provider) => {
	const h = await harness(Provider, { entityFilters: [filter("yes")], entityCreationTemplates: recipes });
	const before = h.store.settings;
	const render = jest.spyOn(InputSuggestScope.prototype, "guard");
	h.tab.update();
	const first = names(h.tab.getSettingDefinitions());
	for (let i = 0; i < 5; i++) expect(names(h.tab.getSettingDefinitions())).toEqual(first);
	expect(render).not.toHaveBeenCalled(); expect(h.pages).not.toHaveBeenCalled();
	expect(h.store.settings).toEqual(before); expect(h.write).not.toHaveBeenCalled();
	if (Provider === FolderEntityProvider || Provider === DataviewEntityProvider) expect(first).toEqual(expect.arrayContaining([
		"Suggest native aliases", "Frontmatter alias property", "Recipe 1 engine", "Recipe 2 template path", "Recipe 2 destination folder", "Recipe 2 entity type", "Filter 1 matching", "Filter 1 property", "Filter 1 pattern",
	]));
	render.mockRestore();
});

test("native key persistence fails closed with controlled feedback and no inherited save", async () => {
	const h = await harness();
	expect(h.tab.getControlValue("path")).toBeUndefined();
	await expect(Promise.resolve(h.tab.setControlValue("path", "wrong"))).resolves.toBeUndefined();
	expect(EntitiesNotice).toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled(); expect(h.plugin.saveData).not.toHaveBeenCalled();
});

test.each(["same row", "recreated page"])("%s keeps rejected exact scalar and original baseline; old callbacks are inert", async reason => {
	const h = await harness(); h.open();
	const old = control(h.tab, "Folder path"); const publicRow = row(h.tab, "Folder path");
	h.store.updateProvider("a", { path: "new canonical" } as never);
	old.change(" [ rejected path ");
	expect(row(h.tab, "Folder path").settingEl.textContent).toContain("Changed in another view");
	if (reason === "same row") { h.tab.update(); expect(row(h.tab, "Folder path")).toBe(publicRow); }
	else { h.tab.hide(); h.open(); expect(row(h.tab, "Folder path")).not.toBe(publicRow); }
	expect(control(h.tab, "Folder path").inputEl.value).toBe(" [ rejected path ");
	old.change("must not touch detached draft");
	control(h.tab, "Folder path").change("another rejected path");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "new canonical" });
	row(h.tab, "Folder path").controls.find(c => c.text === "Reload field")!.click();
	control(h.tab, "Folder path").change("deliberate");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "deliberate" });
});

test("same-type IDs, scalar merge and deletion do not retarget pages or recreate providers", async () => {
	const h = await harness(); const labels = pageNames(h.tab); h.open(h.tab, 1);
	const stale = control(h.tab, "Folder path");
	h.store.reorderProviders(["b", "a"]); h.store.updateProvider("b", { icon: "star" });
	stale.change("second provider");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ providerInstanceId: "b", path: "second provider", icon: "star" });
	control(h.tab, "Remove provider", "button").click(); stale.change("resurrection");
	const added = h.store.addProvider(FolderEntityProvider.getDefaultSettings())!; h.tab.update();
	expect(pageNames(h.tab)).toEqual([labels[0], "Folder 3"]);
	expect(h.store.settings.providerSettings.map(provider => provider.providerInstanceId)).toEqual(["a", added.providerInstanceId]);
});

test.each(["same row", "recreated page"])("whole-array rejected draft survives %s without rebasing another row", async reason => {
	const h = await harness(FolderEntityProvider, { entityFilters: [filter("first"), filter("second")] }); h.open();
	const old = control(h.tab, "Filter 2 pattern");
	h.store.updateProvider("a", { entityFilters: [filter("changed"), filter("second")] } as never);
	old.change("[ exact rejected");
	if (reason === "same row") h.tab.update(); else { h.tab.hide(); h.open(); }
	expect(control(h.tab, "Filter 2 pattern").inputEl.value).toBe("[ exact rejected");
	old.change("stale"); control(h.tab, "Filter 1 property").change("local retry");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [filter("changed"), filter("second")] });
});

test.each([0, 1, 2])("deleting filter %i retires every old index before native rebuild", async index => {
	const h = await harness(FolderEntityProvider, { entityFilters: [filter("first"), filter("second"), filter("third")] }); h.open();
	const stale = control(h.tab, "Filter 2 pattern");
	control(h.tab, `Remove filter ${index + 1}`, "button").click(); stale.change("retargeted");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [filter("first"), filter("second"), filter("third")].filter((_, i) => i !== index) });
});

test.each(["hide", "update", "unload"])("popup ownership and stale controls retire on %s", async reason => {
	const h = await harness(); h.open();
	const old = control(h.tab, "Frontmatter alias property"); old.inputEl.focus();
	expect(poppers.at(-1)?.destroy).not.toHaveBeenCalled();
	if (reason === "hide") h.tab.hide(); else if (reason === "update") h.tab.update(); else h.owner.dispose();
	old.change("stale");
	expect(h.store.settings.providerSettings[0]).not.toHaveProperty("propertyToCreateEntitiesFor");
	expect(poppers[0].destroy).toHaveBeenCalledTimes(1); expect(h.keymap.scopes).toHaveLength(reason === "update" ? 1 : 0);
});

test("recipe drafts preserve all tails/unknown fields across navigation and apply only as one collection", async () => {
	const h = await harness(FolderEntityProvider, { entityCreationTemplates: recipes }); h.open();
	expect(row(h.tab, "Recipe 1 engine").description).toContain("Other configured recipes are unaffected");
	expect(row(h.tab, "Recipe 2 engine").description).toContain("Templater creation unavailable");
	control(h.tab, "Recipe 2 entity type").change("Changed tail");
	expect(row(h.tab, "Recipe 1 engine").description).toContain("Pending:");
	expect(h.store.settings.providerSettings[0].entityCreationTemplates).toEqual(recipes);
	h.tab.hide(); h.open(); expect(control(h.tab, "Recipe 2 entity type").inputEl.value).toBe("Changed tail");
	control(h.tab, "Apply recipe changes", "button").click();
	expect(h.store.settings.providerSettings[0].entityCreationTemplates).toEqual([recipes[0], { ...recipes[1], entityName: "Changed tail" }]);
	control(h.tab, "Recipe 2 entity type").change("discard me");
	row(h.tab, "Apply recipe changes").controls.find(c => c.text === "Discard recipe changes")!.click();
	expect(control(h.tab, "Recipe 2 entity type").inputEl.value).toBe("Changed tail");
});

test("concurrent native views have independent recipe sessions and preserve rejected collection edits", async () => {
	const h = await harness(FolderEntityProvider, { entityCreationTemplates: recipes }); h.open();
	const other = new EntitiesSettingTab(h.app, h.plugin); h.open(other);
	control(h.tab, "Recipe 2 entity type").change("first view"); control(h.tab, "Apply recipe changes", "button").click();
	control(other, "Recipe 2 entity type").change("second view"); control(other, "Apply recipe changes", "button").click();
	expect(row(other, "Apply recipe changes").settingEl.textContent).toContain("Changed in another view");
	other.update(); expect(control(other, "Recipe 2 entity type").inputEl.value).toBe("second view");
	expect(h.store.settings.providerSettings[0].entityCreationTemplates![1].entityName).toBe("first view");
});

test("empty recipes render a virtual disabled row without mutation", async () => {
	const h = await harness(); h.open(); expect(h.write).not.toHaveBeenCalled();
	expect(control(h.tab, "Recipe 1 template path").disabled).toBe(true);
	control(h.tab, "Recipe 1 engine", "dropdown").change("templater");
	expect(control(h.tab, "Recipe 1 template path").disabled).toBe(false);
	control(h.tab, "Recipe 1 entity type").change("Person");
	expect(h.store.settings.providerSettings[0].entityCreationTemplates).toEqual([]);
	control(h.tab, "Apply recipe changes", "button").click();
	expect(h.store.settings.providerSettings[0].entityCreationTemplates).toMatchObject([{ engine: "templater", entityName: "Person" }]);
});

test.each([FolderEntityProvider, DataviewEntityProvider])("%s preserves exact invalid source/filter text and diagnoses it independently of storage", async Provider => {
	const h = await harness(Provider, { entityFilters: [filter("yes")] }); h.open();
	const source = Provider === FolderEntityProvider ? "Folder path" : "Dataview source";
	h.write.mockRejectedValueOnce(new Error("disk full"));
	control(h.tab, source).change("[");
	control(h.tab, "Filter 1 pattern").change("[");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ [Provider === FolderEntityProvider ? "path" : "query"]: "[", entityFilters: [filter("yes", "[")] });
	expect(row(h.tab, "Filter 1 pattern").description).toMatch(/invalid/i);
	expect(await h.store.flush()).toBe(false);
	expect(control(h.tab, source).inputEl.isConnected).toBe(true);
	control(h.tab, "Filter 1 pattern").change("yes"); expect(await h.store.flush()).toBe(true);
});

test("Template invalid folder remains pending through refresh and unrelated accepted changes", async () => {
	const h = await harness(TemplateEntityProvider); h.open();
	control(h.tab, "Folder path").change(" Missing exact "); h.tab.update();
	expect(control(h.tab, "Folder path").inputEl.value).toBe(" Missing exact ");
	control(h.tab, "Action type", "dropdown").change("insert");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "People", actionType: "insert" });
	control(h.tab, "Folder path").change("/");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "/" });
});

test.each([FolderEntityProvider, DataviewEntityProvider])("%s retains alias defaults, unsupported selectors and independent aliases", async Provider => {
	const h = await harness(Provider, { propertyToCreateEntitiesFor: ["legacy"] }); h.open();
	expect(control(h.tab, "Suggest native aliases", "toggle").value).toBe(Provider === FolderEntityProvider);
	expect(row(h.tab, "Frontmatter alias property").description).toMatch(/unsupported/i);
	expect(h.store.settings.providerSettings[0]).toMatchObject({ propertyToCreateEntitiesFor: ["legacy"] });
	control(h.tab, "Suggest native aliases", "toggle").change(false);
	control(h.tab, "Frontmatter alias property").change("ldap");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ shouldCreateEntitiesForAliases: false, propertyToCreateEntitiesFor: "ldap" });
});

test("Folder source counts react to recursion and filter edits without alias expansion", async () => {
	const h = await harness(); h.open();
	const tooltip = () => control(h.tab, "Folder path", "extra").tooltip;
	expect(tooltip()).toContain("1 qualifying file");
	control(h.tab, "Load entities from sub-folders", "toggle").change(true);
	expect(tooltip()).toContain("2 qualifying files");
	control(h.tab, "Add filter", "button").click();
	control(h.tab, "Filter 1 property").change("yes"); control(h.tab, "Filter 1 pattern").change("absent");
	expect(tooltip()).toContain("0 qualifying files");
	control(h.tab, "Folder path").change("");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "" });
});

test.each([
	[FolderEntityProvider, "Icon"], [DataviewEntityProvider, "Icon"], [DateEntityProvider, "Icon"],
	[HelperEntityProvider, "Checkbox icon"], [HelperEntityProvider, "Callout icon"],
] as const)("%s %s owns picker opening, success, refresh cancellation and stale settlement", async (Provider, name) => {
	const h = await harness(Provider); h.open();
	const opener = control(h.tab, name, "button");
	const pending = opener.click() as Promise<void>;
	const picker = modals.at(-1)! as unknown as IconPickerModal;
	expect(picker.modalEl.isConnected).toBe(true);
	picker.modalEl.querySelector<HTMLElement>('[title="star"]')!.click(); await pending;
	const key = name === "Checkbox icon" ? "checkboxIcon" : name === "Callout icon" ? "calloutIcon" : "icon";
	expect(h.store.settings.providerSettings[0]).toMatchObject({ [key]: "star" });
	const second = control(h.tab, name, "button").click() as Promise<void>;
	const cancelled = modals.at(-1)! as unknown as IconPickerModal;
	const retainedIcon = cancelled.modalEl.querySelector<HTMLElement>('[title="box"]')!;
	h.tab.update();
	await expect(cancelled.getInput()).resolves.toBeUndefined(); await second;
	expect(cancelled.modalEl.isConnected).toBe(false);
	retainedIcon.click(); await opener.click();
	expect(h.store.settings.providerSettings[0]).toMatchObject({ [key]: "star" });
	expect(modals).toHaveLength(2);
});

test.each(["close", "owner", "window"])("picker cancellation on %s settles once, closes and releases owner registration", async reason => {
	const h = await harness(); h.open();
	const pending = control(h.tab, "Icon", "button").click() as Promise<void>;
	const picker = modals.at(-1)! as unknown as IconPickerModal;
	const settled = jest.fn(); void picker.getInput().then(settled);
	if (reason === "close") picker.close(); else if (reason === "owner") h.owner.dispose(); else window.dispatchEvent(new Event("pagehide"));
	await pending; picker.close(); await tick();
	expect(settled).toHaveBeenCalledTimes(1); expect(settled).toHaveBeenCalledWith(undefined);
	expect(picker.modalEl.isConnected).toBe(false); expect(h.write).not.toHaveBeenCalled();
});

test("compositionend and its keyup cannot rebuild ahead of a later final input", async () => {
	jest.useFakeTimers(); const h = await harness(); h.open();
	const field = control(h.tab, "Folder path").inputEl; field.focus();
	field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input(field, "partial", true);
	h.tab.update(); h.tab.update(); const count = nativeTab(h.tab).updates;
	field.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
	field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", isComposing: false }));
	jest.runOnlyPendingTimers(); expect(nativeTab(h.tab).updates).toBe(count); expect(field.isConnected).toBe(true);
	input(field, "final exact"); jest.runOnlyPendingTimers();
	expect(nativeTab(h.tab).updates).toBe(count + 1);
	expect(control(h.tab, "Folder path").inputEl.value).toBe("final exact");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "final exact" });
});

test.each(["blur", "later key", "later click"])("cancelled composition releases only after %s effects", async reason => {
	jest.useFakeTimers(); const h = await harness(); h.open();
	const field = control(h.tab, "Folder path").inputEl;
	field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input(field, "pending", true);
	h.tab.update(); const count = nativeTab(h.tab).updates;
	field.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }));
	if (reason === "blur") field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
	if (reason === "later key") {
		field.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" }));
		field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowLeft" }));
	}
	if (reason === "later click") {
		field.dispatchEvent(new Event("pointerdown", { bubbles: true })); field.click();
	}
	expect(nativeTab(h.tab).updates).toBe(count); expect(field.isConnected).toBe(true);
	jest.runOnlyPendingTimers(); expect(nativeTab(h.tab).updates).toBe(count + 1);
	expect(control(h.tab, "Folder path").inputEl.value).toBe("pending");
});

test.each(["hide", "remove", "unload"])("lost compositionend on %s drops deferred work without reopening", async reason => {
	jest.useFakeTimers(); const h = await harness(); h.open();
	const field = control(h.tab, "Folder path").inputEl;
	field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input(field, "pending removal", true); h.tab.update();
	const count = nativeTab(h.tab).updates;
	if (reason === "hide") h.tab.hide(); else if (reason === "remove") field.remove(); else h.owner.dispose();
	await tick(); jest.runOnlyPendingTimers();
	expect(nativeTab(h.tab).updates).toBe(count);
	input(field, "late final"); expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "People" });
});

test("a pending rebuild cannot steal focus from a child modal", async () => {
	jest.useFakeTimers(); const h = await harness(); h.open();
	const field = control(h.tab, "Folder path").inputEl; field.focus();
	field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input(field, "pending", true); h.tab.update();
	field.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
	const modalInput = document.createElement("input"); document.body.append(modalInput); modalInput.focus();
	jest.runOnlyPendingTimers(); expect(document.activeElement).toBe(modalInput);
});

test("document adoption without native rerender and move-back create fresh input ownership", async () => {
	jest.useFakeTimers(); const h = await harness(); h.open();
	const frame = document.createElement("iframe"); document.body.append(frame);
	const doc = frame.contentDocument!; const restoreOther = installNativeDom(doc); const listeners = trackListeners(doc.defaultView!);
	try {
		const old = control(h.tab, "Folder path"); old.inputEl.focus();
		h.store.updateProvider("a", { path: "canonical" } as never); old.change("exact rejected");
		doc.body.append(doc.adoptNode(nativeTab(h.tab).activeContainerEl));
		old.change("retired before observer");
		await tick(); await new Promise<void>(resolve => doc.defaultView!.setTimeout(resolve, 0)); jest.runOnlyPendingTimers();
		const moved = control(h.tab, "Folder path"); expect(moved.inputEl.ownerDocument).toBe(doc); expect(moved.inputEl).not.toBe(old.inputEl);
		expect(moved.inputEl.value).toBe("exact rejected"); old.change("retired");
		moved.inputEl.value = "Pe"; moved.inputEl.focus(); expect(suggestionRows(moved.inputEl).length).toBeGreaterThan(0);
		document.body.append(document.adoptNode(nativeTab(h.tab).activeContainerEl)); await tick(); jest.runOnlyPendingTimers();
		const returned = control(h.tab, "Folder path"); expect(returned.inputEl.ownerDocument).toBe(document); expect(returned.inputEl).not.toBe(moved.inputEl);
		expect(returned.inputEl.value).toBe("exact rejected");
		expect(listeners.filter(listener => listener.type === "pagehide")).toHaveLength(0);
		returned.change("still conflicting"); expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "canonical" });
	} finally { h.tab.hide(); restoreOther(); frame.remove(); }
});

test("moved window destruction closes owned picker and retires callbacks without host cleanup", async () => {
	jest.useFakeTimers(); const h = await harness(); h.open();
	const frame = document.createElement("iframe"); document.body.append(frame); const doc = frame.contentDocument!; const restoreOther = installNativeDom(doc);
	try {
		doc.body.append(doc.adoptNode(nativeTab(h.tab).activeContainerEl)); await tick(); await new Promise<void>(resolve => doc.defaultView!.setTimeout(resolve, 0)); jest.runOnlyPendingTimers();
		(h.app as unknown as { activeDocument: Document }).activeDocument = doc;
		const stale = control(h.tab, "Folder path"); const pending = control(h.tab, "Icon", "button").click() as Promise<void>;
		const picker = modals.at(-1)! as unknown as IconPickerModal;
		expect(picker.modalEl.ownerDocument).toBe(doc); expect(picker.modalEl.querySelector("svg")).not.toBeNull();
		doc.defaultView!.dispatchEvent(new Event("pagehide")); await pending;
		stale.change("dead window"); jest.runOnlyPendingTimers();
		expect(picker.modalEl.isConnected).toBe(false); expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "People" });
	} finally { restoreOther(); frame.remove(); }
});

test.each([FolderEntityProvider, DataviewEntityProvider])("%s malformed imported filters stay read-only without canonical writes", async Provider => {
	const h = await harness(Provider, { entityFilters: [{ type: "unknown", property: "yes", value: "yes" }] });
	nativeTab(h.tab).show();
	expect(h.store.isReadOnly).toBe(true); expect(h.store.loadError).toBeDefined();
	expect(names(h.tab.getSettingDefinitions())).toEqual(["Settings could not be loaded"]);
	expect(h.store.addProvider(Provider.getDefaultSettings())).toBeUndefined(); expect(await h.store.flush()).toBe(false);
	expect(h.write).not.toHaveBeenCalled();
});

test("source edits and detached callbacks never duplicate or start late Dataview evaluations", async () => {
	const h = await harness(DataviewEntityProvider); h.open();
	const stale = control(h.tab, "Dataview source"); h.pages.mockClear(); stale.change("empty");
	expect(h.pages).toHaveBeenCalledTimes(1); expect(control(h.tab, "Dataview source", "extra").tooltip).toContain("0 qualifying files");
	h.tab.update(); h.pages.mockClear(); stale.change("late"); expect(h.pages).not.toHaveBeenCalled();
	delete h.integrations.dataview; control(h.tab, "Dataview source").change("#exact missing integration");
	expect(control(h.tab, "Dataview source", "extra").tooltip).toMatch(/unavailable/i);
	expect(h.store.settings.providerSettings[0]).toMatchObject({ query: "#exact missing integration" });
});

test("filter structural edits close the real property popup and release old selections", async () => {
	const h = await harness(FolderEntityProvider, { entityFilters: [filter("yes")] }); h.open();
	const old = control(h.tab, "Filter 1 property"); old.inputEl.focus(); const popup = poppers.at(-1)!;
	const oldChoice = suggestionRows(old.inputEl)[0];
	expect(oldChoice).toBeDefined();
	control(h.tab, "Add filter", "button").click();
	expect(popup.destroy).toHaveBeenCalledTimes(1); oldChoice.click(); old.change("stale choice");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [filter("yes"), { type: "include", property: "", value: "" }] });
});

describe.each([FolderEntityProvider, DataviewEntityProvider].map(Provider => [Provider.providerTypeID, Provider] as const))("%s retained alias controls", (_type, Provider) => {
	test.each(["hide", "update"])("retained key selector cannot save after %s", async mode => {
		const h = await harness(Provider, { propertyToCreateEntitiesFor: "before" }); h.open();
		const old = control(h.tab, "Frontmatter alias property");
		const retained = new FrontmatterKeySuggest(h.app, old.inputEl);
		if (mode === "hide") h.tab.hide(); else h.tab.update();
		expect(old.inputEl.isConnected).toBe(false);
		retained.selectSuggestion("after-removal");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ propertyToCreateEntitiesFor: "before" });
	});
	test.each(["hide", "update"])("retained toggle cannot save after %s or poison the next edit", async mode => {
		const h = await harness(Provider, { shouldCreateEntitiesForAliases: false }); h.open();
		const old = control(h.tab, "Suggest native aliases", "toggle");
		if (mode === "hide") h.tab.hide(); else h.tab.update();
		old.change(true); if (mode === "hide") h.open();
		input(control(h.tab, "Frontmatter alias property").inputEl, "ldap");
		expect(h.store.settings.providerSettings[0]).toMatchObject({ shouldCreateEntitiesForAliases: false, propertyToCreateEntitiesFor: "ldap" });
	});
});

test.each(["Folder", "Characters"])("%s retired toggles cannot contaminate the next valid field edit", async type => {
	const h = await harness(type === "Folder" ? FolderEntityProvider : CharacterProvider); h.open();
	const field = type === "Folder" ? "Load entities from sub-folders" : "Suggest emoji";
	const stale = control(h.tab, field, "toggle"); h.tab.update(); stale.change(type === "Folder");
	if (type === "Folder") control(h.tab, "Folder path").change("valid next edit"); else control(h.tab, "Suggest Font Awesome", "toggle").change(false);
	expect(h.store.settings.providerSettings[0]).toMatchObject(type === "Folder" ? { shouldLoadSubFolders: false } : { suggestEmoji: true });
});

test("storage recovery updates the warning without replacing focused native inputs", async () => {
	const h = await harness(); nativeTab(h.tab).show(); const storage = row(h.tab, "Settings storage");
	h.write.mockRejectedValueOnce(new Error("disk full")); h.store.updateProvider("a", { icon: "star" }); await h.store.flush(); h.tab.refreshIfDisplayed();
	expect(storage.description).toContain("disk full");
	await h.store.flush(); h.tab.clearSaveError(); expect(storage.description).not.toContain("disk full");
	expect(row(h.tab, "Settings storage")).toBe(storage);
	h.open(); const field = control(h.tab, "Folder path"); field.inputEl.focus(); h.tab.clearSaveError(); expect(control(h.tab, "Folder path")).toBe(field);
});

test("a failed load can explicitly retry and only then expose provider pages", async () => {
	const h = await harness(FolderEntityProvider, { entityFilters: "malformed" }); nativeTab(h.tab).show();
	const load = jest.fn(() => h.store.load(async () => JSON.parse(JSON.stringify({ schemaVersion: 1, providerSettings: [{ ...FolderEntityProvider.getDefaultSettings(), providerInstanceId: "new" }] }))));
	(h.plugin as unknown as { loadSettings: () => Promise<boolean> }).loadSettings = load;
	await control(h.tab, "Settings could not be loaded", "button").click();
	expect(load).toHaveBeenCalledTimes(1); expect(h.store.isReadOnly).toBe(false); expect(pageNames(h.tab)).toEqual(["Folder 1"]);
});

test("concurrent icon modals keep independent original baselines and retain a rejected choice", async () => {
	const h = await harness(); h.open();
	const other = new EntitiesSettingTab(h.app, h.plugin); h.open(other);
	const first = control(h.tab, "Icon", "button").click() as Promise<void>; const a = modals.at(-1)!;
	const second = control(other, "Icon", "button").click() as Promise<void>; const b = modals.at(-1)!;
	b.modalEl.querySelector<HTMLElement>('[title="star"]')!.click(); await second;
	a.modalEl.querySelector<HTMLElement>('[title="box"]')!.click(); await first;
	expect(h.store.settings.providerSettings[0].icon).toBe("star");
	expect(control(h.tab, "Icon", "button").text).toBe("box");
	expect(row(h.tab, "Icon").settingEl.textContent).toContain("Changed in another view");
	h.tab.hide(); h.open(); expect(control(h.tab, "Icon", "button").text).toBe("box");
});

test("same-render picker settlement cancels overlapping children before they can change a newer render", async () => {
	const h = await harness(); h.open(); const opener = control(h.tab, "Icon", "button");
	const first = opener.click() as Promise<void>; const a = modals.at(-1)! as unknown as IconPickerModal;
	const second = opener.click() as Promise<void>; const b = modals.at(-1)!;
	const staleChoice = a.modalEl.querySelector<HTMLElement>('[title="box"]')!;
	b.modalEl.querySelector<HTMLElement>('[title="star"]')!.click(); await second; await first;
	await expect(a.getInput()).resolves.toBeUndefined(); staleChoice.click();
	expect(h.store.settings.providerSettings[0].icon).toBe("star"); expect(control(h.tab, "Icon", "button").text).toBe("star");
});

test("an icon choice in an already rejected field cannot silently rebase its baseline", async () => {
	const h = await harness(); h.open();
	h.store.updateProvider("a", { icon: "canonical" });
	const pick = async (name: string) => {
		const pending = control(h.tab, "Icon", "button").click() as Promise<void>;
		modals.at(-1)!.modalEl.querySelector<HTMLElement>(`[title="${name}"]`)!.click(); await pending;
	};
	await pick("box"); await pick("star");
	expect(h.store.settings.providerSettings[0].icon).toBe("canonical");
	expect(control(h.tab, "Icon", "button").text).toBe("star");
	expect(row(h.tab, "Icon").settingEl.textContent).toContain("Changed in another view");
});

test("Core recipes and unknown fields roundtrip unchanged; new recipes cannot choose Core", async () => {
	const core = { engine: "core", templatePath: "Core/Person.md", entityName: "Person", folderPath: "/", future: { nested: [false, "preserved"] } };
	const h = await harness(FolderEntityProvider, { entityCreationTemplates: [core, recipes[1]] }); h.open();
	expect(control(h.tab, "Recipe 1 engine", "dropdown").options).toContain("core");
	control(h.tab, "Apply recipe changes", "button").click();
	expect(h.store.settings.providerSettings[0].entityCreationTemplates).toEqual([core, recipes[1]]);
	const reloaded = new SettingsStore(async () => {}, async () => {}, () => FolderEntityProvider.getDefaultSettings());
	expect(await reloaded.load(async () => h.store.settings)).toBe(true);
	const empty = await harness(); empty.open(); expect(control(empty.tab, "Recipe 1 engine", "dropdown").options).toEqual(["disabled", "templater"]);
});

test.each(["hide", "update", "unload", "discard"])("native recipe input resources retire on %s and old Apply is inert", async reason => {
	const h = await harness(FolderEntityProvider, { entityCreationTemplates: [{ engine: "templater", templatePath: "", folderPath: "", entityName: "Person" }] }); h.open();
	const text = control(h.tab, "Recipe 1 template path"); text.inputEl.focus(); const popup = poppers.at(-1)!;
	const apply = control(h.tab, "Apply recipe changes", "button"); text.change("pending template.md");
	if (reason === "hide") h.tab.hide(); else if (reason === "update") h.tab.update(); else if (reason === "unload") h.owner.dispose();
	else row(h.tab, "Apply recipe changes").controls.find(c => c.text === "Discard recipe changes")!.click();
	apply.click(); text.change("stale"); expect(popup.destroy).toHaveBeenCalledTimes(1);
	expect(h.store.settings.providerSettings[0].entityCreationTemplates![0].templatePath).toBe("");
});

test("destination root slash is preserved by applying native recipe fields", async () => {
	const h = await harness(FolderEntityProvider, { entityCreationTemplates: [{ engine: "templater", templatePath: "", folderPath: "/", entityName: "Person" }] }); h.open();
	control(h.tab, "Recipe 1 entity type").change("Project"); control(h.tab, "Apply recipe changes", "button").click();
	expect(h.store.settings.providerSettings[0].entityCreationTemplates).toMatchObject([{ folderPath: "/", entityName: "Project" }]);
});

test.each(["compositionend", "lost end"])("%s cancellation reads exact restored text on blur without a final input", async reason => {
	jest.useFakeTimers(); const h = await harness(); h.open(); const field = control(h.tab, "Folder path").inputEl;
	field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input(field, "intermediate", true); h.tab.update();
	field.value = "People"; // Browser cancellation restored DOM without a final input event.
	if (reason === "compositionend") field.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }));
	field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); jest.runOnlyPendingTimers();
	expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "People" });
	expect(control(h.tab, "Folder path").inputEl.value).toBe("People"); expect(h.write).not.toHaveBeenCalled();
});

test("recipe Apply waits for cancelled composition's visible value and drops queued Apply on removal", async () => {
	jest.useFakeTimers(); const h = await harness(FolderEntityProvider, { entityCreationTemplates: recipes }); h.open();
	const field = control(h.tab, "Recipe 2 entity type").inputEl;
	field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input(field, "intermediate", true);
	control(h.tab, "Apply recipe changes", "button").click();
	expect(h.store.settings.providerSettings[0].entityCreationTemplates).toEqual(recipes);
	field.value = "Restored exact"; field.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })); field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
	jest.runOnlyPendingTimers();
	expect(h.store.settings.providerSettings[0].entityCreationTemplates![1].entityName).toBe("Restored exact");
	field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input(field, "must stay pending", true);
	control(h.tab, "Apply recipe changes", "button").click(); field.remove(); await tick(); jest.runOnlyPendingTimers();
	expect(h.store.settings.providerSettings[0].entityCreationTemplates![1].entityName).toBe("Restored exact");
});

test("native hide drains pending storage despite a throwing render cleanup", async () => {
	const h = await harness(); h.open();
	const { inputSuggestScope } = require("../src/ui/inputSuggestLifecycle");
	inputSuggestScope(row(h.tab, "Folder path").settingEl).own(() => { throw new Error("cleanup failure"); });
	const errors = jest.spyOn(console, "error").mockImplementation(() => {});
	const save = jest.spyOn(h.plugin, "saveSettings"); h.write.mockRejectedValueOnce(new Error("disk full"));
	control(h.tab, "Folder path").change("in memory"); expect(await h.store.flush()).toBe(false);
	try {
		expect(() => h.tab.hide()).not.toThrow(); expect(save).toHaveBeenCalledTimes(1); expect(await h.store.flush()).toBe(true);
		expect(h.write.mock.calls.at(-1)?.[0]).toMatchObject({ providerSettings: [{ path: "in memory" }, {}] });
		expect(errors).toHaveBeenCalled();
	} finally { errors.mockRestore(); }
});

test("failed native canonical mutation retains its pending value through a refresh and retry", async () => {
	const h = await harness(); h.open(); const update = jest.spyOn(h.store, "updateProvider").mockReturnValueOnce(false);
	control(h.tab, "Folder path").change("pending"); expect(row(h.tab, "Folder path").settingEl.textContent).toContain("not applied");
	h.tab.update(); expect(control(h.tab, "Folder path").inputEl.value).toBe("pending");
	control(h.tab, "Folder path").change("retried"); expect(h.store.settings.providerSettings[0]).toMatchObject({ path: "retried" });
	expect(update).toHaveBeenCalledTimes(2);
});

test("unavailable provider data and non-editable enabled/generic-icon values are preserved", async () => {
	const h = await harness(HelperEntityProvider, { enabled: false, icon: "preserved unused icon" }); h.open();
	expect(names(h.tab.getSettingDefinitions())).not.toContain("Enabled");
	expect([...nativeTab(h.tab).nativeRows.values()].map(row => row.setting.name)).not.toContain("Icon");
	control(h.tab, "Add created tag", "toggle").change(false);
	expect(h.store.settings.providerSettings[0]).toMatchObject({ enabled: false, icon: "preserved unused icon" });
	const unavailable = h.store.addProvider({ providerTypeID: "unknown-provider", enabled: false, icon: "retained" })!;
	h.open(h.tab, 2); expect([...nativeTab(h.tab).nativeRows.values()].map(row => row.setting.name)).toEqual(["Provider unavailable"]);
	expect(h.store.settings.providerSettings[2]).toEqual(unavailable);
});

test("Metadata Menu's unused provider icon is preserved without an ineffective control", async () => {
	const h = await harness(MetadataMenuProvider, { icon: "stored unused icon" }); h.open();
	expect(names(h.tab.getSettingDefinitions())).not.toContain("Icon");
	expect(h.store.settings.providerSettings[0].icon).toBe("stored unused icon");
	expect(h.write).not.toHaveBeenCalled();
});

test.each(["missing NLP", "NLP conflict", "Core title"])("native Date status preserves %s precedence and refreshes after repair", async problem => {
	const h = await harness(DateEntityProvider, { includeWeekSuggestions: false });
	const root = h.app.vault.getRoot(); Object.assign(root, { isRoot: () => true });
	const options = { format: "[bad.md]", folder: "", template: "" };
	const create = jest.fn(); const lookup = jest.fn();
	Object.assign(h.app, {
		internalPlugins: { getPluginById: () => ({ enabled: true, instance: { options, getFormat: () => options.format, getDailyNote: create } }) },
		fileManager: { getNewFileParent: () => root },
	});
	Object.assign(h.app.vault, { getAbstractFileByPathInsensitive: lookup });
	if (problem !== "missing NLP") h.integrations["nldates-obsidian"] = {
		parseDate: jest.fn(), settings: { autocompleteTriggerPhrase: problem === "NLP conflict" ? "@" : "#", isAutosuggestEnabled: true },
	};
	h.open();
	expect(control(h.tab, "Date availability", "extra").tooltip).toContain(problem === "missing NLP" ? "NLDates plugin not found" : problem === "NLP conflict" ? "conflicts with autocomplete" : "Daily Notes cannot resolve missing notes");
	h.integrations["nldates-obsidian"] = { parseDate: jest.fn(), settings: { autocompleteTriggerPhrase: "#", isAutosuggestEnabled: true } };
	options.format = "YYYY-MM-DD";
	control(h.tab, "Create non-existent dates", "toggle").change(false);
	expect(control(h.tab, "Date availability", "extra").tooltip).toBe("NLDates plugin OK");
	expect(create).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
});

test("icon searches release removed results and only the current result can settle", async () => {
	const h = await harness(); h.open(); const pending = control(h.tab, "Icon", "button").click() as Promise<void>;
	const picker = modals.at(-1)! as unknown as IconPickerModal;
	const state = picker as unknown as { renderScope: { cleanups: Set<() => void> } };
	const before = state.renderScope.cleanups.size;
	const stale = picker.modalEl.querySelector<HTMLElement>('[title="box"]')!;
	const search = picker.modalEl.querySelector<HTMLInputElement>("input")!;
	for (let i = 0; i < 40; i++) input(search, i % 2 ? "" : "star");
	expect(state.renderScope.cleanups.size).toBeLessThanOrEqual(before + 1);
	stale.click(); expect(picker.modalEl.isConnected).toBe(true);
	picker.modalEl.querySelector<HTMLElement>('[title="star"]')!.click(); await pending;
	expect(h.store.settings.providerSettings[0].icon).toBe("star");
	expect(state.renderScope.cleanups.size).toBe(0);
});

test("composition cancellation preserves a raw unsupported alias selector", async () => {
	jest.useFakeTimers(); const h = await harness(FolderEntityProvider, { propertyToCreateEntitiesFor: ["legacy"] }); h.open();
	const field = control(h.tab, "Frontmatter alias property").inputEl;
	field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input(field, "intermediate", true);
	field.value = ""; field.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" })); field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
	jest.runOnlyPendingTimers();
	expect(h.store.settings.providerSettings[0]).toMatchObject({ propertyToCreateEntitiesFor: ["legacy"] }); expect(h.write).not.toHaveBeenCalled();
});

test("a sibling filter edit waits for composition and cancellation restores only its own leaf", async () => {
	jest.useFakeTimers(); const h = await harness(FolderEntityProvider, { entityFilters: [filter("first"), filter("second")] }); h.open();
	const first = control(h.tab, "Filter 1 pattern").inputEl;
	first.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input(first, "intermediate", true);
	control(h.tab, "Filter 2 property").change("changed sibling");
	expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [filter("first"), filter("second")] });
	first.value = "yes"; first.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" })); first.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
	jest.runOnlyPendingTimers();
	expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [filter("first"), filter("changed sibling")] });
});

test("filter removal waits for composition before shifting the captured row indexes", async () => {
	jest.useFakeTimers(); const h = await harness(FolderEntityProvider, { entityFilters: [filter("first"), filter("second"), filter("third")] }); h.open();
	const second = control(h.tab, "Filter 2 pattern").inputEl;
	second.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); input(second, "intermediate", true);
	control(h.tab, "Remove filter 1", "button").click();
	expect(second.isConnected).toBe(true);
	expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [filter("first"), filter("second"), filter("third")] });
	second.value = "final visible"; second.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })); second.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
	jest.runOnlyPendingTimers();
	expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [filter("second", "final visible"), filter("third")] });
	expect(control(h.tab, "Filter 1 pattern").inputEl.value).toBe("final visible");
	input(second, "late input"); expect(h.store.settings.providerSettings[0]).toMatchObject({ entityFilters: [filter("second", "final visible"), filter("third")] });
});

test("selection restoration accepts native focus on the replacement field without moving another focus", async () => {
	const h = await harness(); h.open(); const old = control(h.tab, "Folder path").inputEl; old.focus(); old.setSelectionRange(1, 4);
	const native = require("./nativeSettingsHostMock").NativeTab.prototype;
	const update = native.update;
	const spy = jest.spyOn(native, "update").mockImplementation(function (this: unknown) { update.call(this); control(this, "Folder path").inputEl.focus(); });
	try { h.tab.update(); const next = control(h.tab, "Folder path").inputEl; expect(next).not.toBe(old); expect(next.selectionStart).toBe(1); expect(next.selectionEnd).toBe(4); }
	finally { spy.mockRestore(); }
});
