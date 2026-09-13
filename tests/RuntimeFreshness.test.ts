import { App, Editor, EditorSuggestContext, Events, Plugin, PluginManifest, TFile } from "obsidian";
import Entities from "../src/main";
import { EntitySuggestionItem } from "../src/EntitiesSuggestor";
import { ConfiguredProviderSettings, EntityProvider, EntityProviderUserSettings, ProviderSettingsInput, RefreshBehavior } from "../src/Providers/EntityProvider";
import { FolderEntityProvider } from "../src/Providers/FolderEntityProvider";
import { DataviewEntityProvider } from "../src/Providers/DataviewEntityProvider";
import { TemplateEntityProvider } from "../src/Providers/TemplateProvider";
import { MetadataMenuProvider } from "../src/Providers/MetadataMenuProvider";
import { CharacterProvider } from "../src/Providers/CharacterProvider";
import { TriggerCharacter } from "../src/entities.types";

jest.mock("obsidian", () => {
	class MockEvents {
		listeners = new Map<string, Set<() => void>>();
		on(name: string, callback: () => void) {
			if (!this.listeners.has(name)) this.listeners.set(name, new Set());
			this.listeners.get(name)!.add(callback);
			return { emitter: this, name, callback };
		}
		offref(ref: { name: string; callback: () => void }) { this.listeners.get(ref.name)?.delete(ref.callback); }
		trigger(name: string) { this.listeners.get(name)?.forEach(callback => callback()); }
	}
	return {
		Events: MockEvents,
		TFile: class {},
		EditorSuggest: class {
			context: EditorSuggestContext | null = null;
			close() { this.context = null; }
		},
		Plugin: class {
			cleanups: (() => void)[] = [];
			constructor(public app: App, public manifest: PluginManifest) {}
			register(callback: () => void) { this.cleanups.push(callback); }
			registerEvent(ref: { emitter: MockEvents; name: string; callback: () => void }) { this.register(() => ref.emitter.offref(ref)); }
			addSettingTab() {}
			registerEditorSuggest() {}
			onunload() {}
			unload() { this.onunload(); this.cleanups.splice(0).forEach(callback => callback()); }
		},
		prepareFuzzySearch: (query: string) => (text: string) => text.toLowerCase().includes(query.toLowerCase()) ? { score: 10, matches: [[0, query.length]] } : null,
		Notice: jest.fn(),
	};
});
// Use the bundled dictionary with the same default-import interop as the production bundle.
jest.mock("emojilib", () => ({ __esModule: true, default: jest.requireActual("emojilib") }));
jest.mock("../src/EntitiesSettings", () => ({ EntitiesSettingTab: class {} }));
jest.mock("../src/userComponents", () => ({}));
jest.mock("../src/entitiesUtilities", () => ({}));

interface TestSettings extends EntityProviderUserSettings {
	label: string;
	queryDependent: boolean;
	mode: RefreshBehavior;
	triggers: TriggerCharacter[];
	creation: string;
}
class TestProvider extends EntityProvider<TestSettings> {
	static readonly providerTypeID: string = "test";
	static getDescription() { return "Test"; }
	static buildSummarySetting() {}
	static getDefaultSettings(): TestSettings {
		return { providerTypeID: "test", enabled: true, icon: "", label: "Test", queryDependent: true, mode: RefreshBehavior.Default, triggers: [TriggerCharacter.At], creation: "" };
	}
	getDefaultSettings() { return TestProvider.getDefaultSettings(); }
	constructor(plugin: Plugin, settings: ProviderSettingsInput<TestSettings>) {
		super(plugin, settings);
		if (this.settings.label === "throw-constructor") throw new Error("constructor failed");
	}
	get triggers() { return this.settings.triggers; }
	get isQueryDependent() { return this.settings.queryDependent; }
	getRefreshBehavior() { return this.settings.mode; }
	getEntityList() { return [{ suggestionText: this.settings.label }]; }
	getTemplateCreationSuggestions(query: string) { return this.settings.creation ? [{ suggestionText: `${this.settings.creation}: ${query}`, match: { score: -10, matches: [] } }] : []; }
}
const config = (id: string, overrides: Partial<TestSettings> = {}) => ({ ...TestProvider.getDefaultSettings(), ...overrides, providerInstanceId: id });
const file = (path: string) => Object.assign(new TFile(), { path, basename: path.split("/").pop()!.replace(/\.md$/, "") });
const editor = () => ({ replaceRange: jest.fn(), setCursor: jest.fn(), posToOffset: jest.fn(() => 0), offsetToPos: jest.fn(() => ({ line: 0, ch: 1 })), getLine: jest.fn(() => "@") }) as unknown as jest.Mocked<Editor>;
const context = (query = "@", targetEditor = editor()): EditorSuggestContext => ({ query, editor: targetEditor, file: file("Writing.md"), start: { line: 0, ch: 1 }, end: { line: 0, ch: query.length } });
const fail = () => { throw new Error("provider failure"); };
const labels = (items: EntitySuggestionItem[]) => items.map(item => item.suggestionText);
const plugins: Entities[] = [];

async function runtime(settings: ConfiguredProviderSettings[]) {
	const folders = new Map<string, TFile[]>();
	const metadata = new Map<string, { frontmatter: Record<string, unknown> }>();
	const integrations: Record<string, unknown> = {};
	const layoutCallbacks: (() => void)[] = [];
	const vault = Object.assign(new Events(), {
		configDir: ".obsidian",
		getFolderByPath: (path: string) => folders.has(path) ? { children: folders.get(path) } : null,
		adapter: {
			stat: async () => ({ type: "file" }),
			read: async () => JSON.stringify({ schemaVersion: 1, providerSettings: settings }),
			write: jest.fn(async () => {}),
		},
	});
	const metadataCache = Object.assign(new Events(), {
		getFileCache: (target: TFile) => metadata.get(target.path),
		getCache: (path: string) => metadata.get(path),
		getFirstLinkpathDest: (path: string) => file(`${path}.md`),
	});
	const app = { vault, metadataCache, plugins: { getPlugin: (id: string) => integrations[id] }, workspace: { onLayoutReady: (callback: () => void) => layoutCallbacks.push(callback) } } as unknown as App;
	const plugin = new Entities(app, { id: "entities", dir: ".obsidian/plugins/entities" } as PluginManifest);
	const register = plugin.registerEntityProviders.bind(plugin);
	jest.spyOn(plugin, "registerEntityProviders").mockImplementation(() => { register(); plugin.providerRegistry.registerProviderType(TestProvider); });
	plugins.push(plugin);
	await plugin.onload();
	return { plugin, suggestor: plugin.suggestor, registry: plugin.providerRegistry, folders, metadata, integrations, layoutCallbacks, vault, metadataCache };
}

beforeEach(() => {
	jest.useFakeTimers();
	jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	plugins.splice(0).forEach(plugin => plugin.unload());
	jest.useRealTimers();
	jest.restoreAllMocks();
});

test("two Folder and two Dataview configured instances all contribute distinct labels", async () => {
	const r = await runtime([
		{ ...FolderEntityProvider.getDefaultSettings(), providerInstanceId: "folder-a", path: "A" },
		{ ...FolderEntityProvider.getDefaultSettings(), providerInstanceId: "folder-b", path: "B" },
		{ ...DataviewEntityProvider.getDefaultSettings(), providerInstanceId: "dv-a", query: "A" },
		{ ...DataviewEntityProvider.getDefaultSettings(), providerInstanceId: "dv-b", query: "B" },
	]);
	r.folders.set("A", [file("A/Folder A.md")]); r.folders.set("B", [file("B/Folder B.md")]);
	r.integrations.dataview = { api: { pages: (query: string) => [{ file: { name: `Dataview ${query}`, path: `${query}.md`, aliases: [] } }] } };
	expect(labels(r.suggestor.getSuggestions(context()))).toEqual(["Folder A", "Folder B", "Dataview A", "Dataview B"]);
});

test("one provider retains a separate current entry for each trigger", async () => {
	const r = await runtime([config("multi", { triggers: [TriggerCharacter.At, TriggerCharacter.Colon], queryDependent: false, mode: RefreshBehavior.Never })]);
	const retrieve = jest.spyOn(r.registry.getProviders()[0], "getEntityList").mockImplementation((query, trigger) => [{ suggestionText: `Item ${trigger}` }]);
	expect(labels(r.suggestor.getSuggestions(context("@")))).toEqual(["Item @"]);
	expect(labels(r.suggestor.getSuggestions(context(":")))).toEqual(["Item :"]);
	r.suggestor.getSuggestions(context("@"));
	expect(retrieve).toHaveBeenCalledTimes(2);
});

test("Character narrow-to-broad query within 200ms recovers omitted symbols", async () => {
	const r = await runtime([{ ...CharacterProvider.getDefaultSettings(), providerInstanceId: "symbols", suggestFontAwesome: false }]);
	const narrow = r.suggestor.getSuggestions(context(":cat"));
	jest.advanceTimersByTime(1);
	const broad = r.suggestor.getSuggestions(context(":ca"));
	expect(narrow.length).toBeGreaterThan(0);
	expect(broad.length).toBeGreaterThan(narrow.length);
	expect(narrow.some(item => item.replacementText === "🌵")).toBe(false);
	expect(broad.some(item => item.replacementText === "🌵")).toBe(true);
});

test.each([RefreshBehavior.Default, RefreshBehavior.ShouldRefresh, RefreshBehavior.Never])("refresh policy %s observes query, time and explicit invalidation with bounded entries", async mode => {
	const r = await runtime([config("source", { mode })]);
	const retrieve = jest.spyOn(r.registry.getProviders()[0], "getEntityList");
	r.suggestor.getSuggestions(context());
	jest.advanceTimersByTime(200);
	r.suggestor.getSuggestions(context());
	expect(retrieve).toHaveBeenCalledTimes(mode === RefreshBehavior.ShouldRefresh ? 2 : 1);
	jest.advanceTimersByTime(1);
	r.suggestor.getSuggestions(context());
	expect(retrieve).toHaveBeenCalledTimes(mode === RefreshBehavior.ShouldRefresh ? 3 : mode === RefreshBehavior.Default ? 2 : 1);
	const count = retrieve.mock.calls.length;
	r.suggestor.getSuggestions(context("@T"));
	expect(retrieve).toHaveBeenCalledTimes(count + 1);
	r.suggestor.invalidateData();
	r.suggestor.getSuggestions(context("@T"));
	expect(retrieve).toHaveBeenCalledTimes(count + 2);
	for (let i = 0; i < 1000; i++) r.suggestor.getSuggestions(context(`@query${i}`));
	// Intentionally inspect only cardinality: no unbounded query history per configured pair.
	expect((r.suggestor as unknown as { providerSuggestions: Map<string, unknown> }).providerSuggestions.size).toBe(1);
});

test("query-independent raw cache is fuzzy-filtered afresh and result mutations do not poison later scores", async () => {
	const r = await runtime([config("source", { queryDependent: false, mode: RefreshBehavior.Never })]);
	const raw = [{ suggestionText: "Alpha" }, { suggestionText: "Beta" }];
	const retrieve = jest.spyOn(r.registry.getProviders()[0], "getEntityList").mockReturnValue(raw);
	const first = r.suggestor.getSuggestions(context("@Al"));
	first[0].suggestionText = "mutated";
	first[0].match!.score = 999;
	expect(labels(r.suggestor.getSuggestions(context("@Be")))).toEqual(["Beta"]);
	expect(r.suggestor.getSuggestions(context("@Al"))[0]).toMatchObject({ suggestionText: "Alpha", match: { score: 10 } });
	expect(raw).toEqual([{ suggestionText: "Alpha" }, { suggestionText: "Beta" }]);
	expect(retrieve).toHaveBeenCalledTimes(1);
});

test.each(["getRefreshBehavior", "isQueryDependent", "getEntityList", "getTemplateCreationSuggestions"] as const)("%s failure is isolated from another stage/provider and diagnostic is bounded", async stage => {
	const r = await runtime([config("bad", { label: "Ordinary", creation: "Create" }), config("good", { label: "Other" })]);
	const bad = r.registry.getProviders()[0];
	if (stage === "isQueryDependent") jest.spyOn(bad, stage, "get").mockImplementation(fail);
	else jest.spyOn(bad, stage).mockImplementation(fail);
	for (let i = 0; i < 20; i++) {
		const result = labels(r.suggestor.getSuggestions(context()));
		expect(result).toContain("Other");
		expect(result).toContain(stage === "getTemplateCreationSuggestions" ? "Ordinary" : "Create: ");
	}
	expect(console.error).toHaveBeenCalledTimes(1);
});

test.each(["isEnabled", "triggers"] as const)("throwing %s getter cannot suppress another provider", async property => {
	const r = await runtime([config("bad"), config("good", { label: "Good" })]);
	jest.spyOn(r.registry.getProviders()[0], property, "get").mockImplementation(fail);
	for (let i = 0; i < 20; i++) expect(labels(r.suggestor.getSuggestions(context()))).toEqual(["Good"]);
	expect(console.error).toHaveBeenCalledTimes(1);
});

test("constructor failure and unavailable configs stay inactive and replacement is atomic", async () => {
	const r = await runtime([config("old")]);
	const snapshots: string[][] = [];
	const revision = r.registry.revision;
	const off = r.registry.onChange(() => snapshots.push(r.registry.getProviders().map(p => p.providerInstanceId)));
	const configs = [config("first"), config("broken", { label: "throw-constructor" }), config("unknown", { providerTypeID: "unavailable" }), config("last")];
	r.registry.instantiateProvidersFromSettings(configs);
	expect(snapshots).toEqual([["first", "last"]]);
	expect(r.registry.revision).toBe(revision + 1);
	expect(configs.map(c => c.providerInstanceId)).toEqual(["first", "broken", "unknown", "last"]);
	off();
});

test("Never failed refresh discards previous success and retries; creation remains uncached", async () => {
	const r = await runtime([config("source", { mode: RefreshBehavior.Never, creation: "Create" })]);
	const provider = r.registry.getProviders()[0];
	const retrieve = jest.spyOn(provider, "getEntityList");
	const creation = jest.spyOn(provider, "getTemplateCreationSuggestions");
	expect(labels(r.suggestor.getSuggestions(context()))).toContain("Test");
	r.suggestor.invalidateData();
	retrieve.mockImplementationOnce(fail);
	expect(labels(r.suggestor.getSuggestions(context()))).toEqual(["Create: "]);
	expect(labels(r.suggestor.getSuggestions(context()))).toContain("Test");
	expect(retrieve).toHaveBeenCalledTimes(3);
	expect(creation).toHaveBeenCalledTimes(3);
});

test("malformed items are individually skipped and never lock a Never provider into cached emptiness", async () => {
	const r = await runtime([config("source", { mode: RefreshBehavior.Never })]);
	const retrieve = jest.spyOn(r.registry.getProviders()[0], "getEntityList");
	retrieve.mockReturnValueOnce([null, {}, { suggestionText: 42 }, { suggestionText: "Bad icon", icon: {} }, { get suggestionText() { return fail(); } }, { suggestionText: "Good" }] as unknown as EntitySuggestionItem[]);
	expect(labels(r.suggestor.getSuggestions(context()))).toEqual(["Good"]);
	retrieve.mockReturnValueOnce([null] as unknown as EntitySuggestionItem[]);
	expect(r.suggestor.getSuggestions(context())).toEqual([]);
	expect(labels(r.suggestor.getSuggestions(context()))).toEqual(["Test"]);
	expect(console.error).toHaveBeenCalledTimes(1);
});

test.each(["delete", "disable", "edit", "reorder", "trigger", "reload"])("configuration %s closes old results, clears dismissal and rejects retained callbacks", async change => {
	const r = await runtime([config("a"), config("b", { label: "Second" })]);
	const ctx = context();
	const action = jest.fn(() => "action result");
	jest.spyOn(r.registry.getProviders()[0], "getEntityList").mockReturnValue([{ suggestionText: "Action", action }, { suggestionText: "Link" }]);
	const old = r.suggestor.getSuggestions(ctx);
	r.suggestor.context = ctx;
	await r.suggestor.close();
	expect(r.suggestor.onTrigger({ line: 0, ch: 1 }, ctx.editor, ctx.file)).toBeNull();
	const close = jest.spyOn(r.suggestor, "close");
	if (change === "delete") r.plugin.settingsStore.deleteProvider("a");
	if (change === "disable") r.plugin.settingsStore.updateProvider("a", { enabled: false });
	if (change === "edit") r.plugin.settingsStore.updateProvider("a", { icon: "star" });
	if (change === "reorder") r.plugin.settingsStore.reorderProviders(["b", "a"]);
	if (change === "trigger") r.plugin.settingsStore.updateProvider("a", { triggers: [TriggerCharacter.Colon] });
	r.plugin.loadEntityProviders();
	expect(close).toHaveBeenCalledTimes(1);
	expect(r.suggestor.onTrigger({ line: 0, ch: 1 }, ctx.editor, ctx.file)).not.toBeNull();
	old.forEach(item => r.suggestor.selectSuggestion(item, {} as MouseEvent));
	expect(action).not.toHaveBeenCalled();
	expect(ctx.editor.replaceRange).not.toHaveBeenCalled();
	const fresh = r.suggestor.getSuggestions(ctx);
	r.suggestor.selectSuggestion(fresh[0], {} as MouseEvent);
	expect(ctx.editor.replaceRange).toHaveBeenCalledTimes(1);
});

test("new result epoch rejects a retained old query item while close-before-selection still works", async () => {
	const r = await runtime([config("source")]);
	const ctx = context();
	const [old] = r.suggestor.getSuggestions(ctx);
	const [fresh] = r.suggestor.getSuggestions(ctx);
	r.suggestor.context = ctx;
	await r.suggestor.close();
	r.suggestor.selectSuggestion(old, {} as MouseEvent);
	expect(ctx.editor.replaceRange).not.toHaveBeenCalled();
	r.suggestor.selectSuggestion(fresh, {} as MouseEvent);
	expect(ctx.editor.replaceRange).toHaveBeenCalledWith("[[Test]]", { line: 0, ch: 0 }, ctx.end);
});

test.each(["replace", "unload", "close", "data"])("awaited action return after %s respects only generation/unload validity", async change => {
	const r = await runtime([config("source")]);
	let finish!: (value: string) => void;
	const action = jest.fn(() => new Promise<string>(resolve => { finish = resolve; }));
	jest.spyOn(r.registry.getProviders()[0], "getEntityList").mockReturnValue([{ suggestionText: "Act", action }]);
	const ctx = context();
	const [item] = r.suggestor.getSuggestions(ctx);
	r.suggestor.selectSuggestion(item, {} as MouseEvent);
	if (change === "replace") r.plugin.loadEntityProviders();
	if (change === "unload") r.plugin.unload();
	if (change === "close") await r.suggestor.close();
	if (change === "data") r.metadataCache.trigger("changed");
	finish("returned text");
	await Promise.resolve();
	expect(action).toHaveBeenCalledTimes(1); // Side effects were already started, not cancelled.
	expect(ctx.editor.replaceRange).toHaveBeenCalledTimes(["close", "data"].includes(change) ? 1 : 0);
});

test("Folder metadata changes and Template create/rename/delete refresh without closing on data events", async () => {
	const r = await runtime([
		{ ...FolderEntityProvider.getDefaultSettings(), providerInstanceId: "folder", path: "Notes" },
		{ ...TemplateEntityProvider.getDefaultSettings(), providerInstanceId: "template", path: "Templates" },
	]);
	r.folders.set("Notes", [file("Notes/Note.md")]);
	r.folders.set("Templates", [file("Templates/Original.md")]);
	const close = jest.spyOn(r.suggestor, "close");
	expect(labels(r.suggestor.getSuggestions(context()))).toEqual(["Note"]);
	r.metadata.set("Notes/Note.md", { frontmatter: { aliases: ["Fresh Alias"] } });
	r.metadataCache.trigger("changed");
	expect(labels(r.suggestor.getSuggestions(context()))).toEqual(["Note", "Fresh Alias"]);
	expect(labels(r.suggestor.getSuggestions(context("/")))).toEqual(["Original"]);
	r.folders.get("Templates")!.push(file("Templates/Created.md")); r.vault.trigger("create");
	expect(labels(r.suggestor.getSuggestions(context("/")))).toEqual(["Original", "Created"]);
	r.folders.set("Templates", [file("Templates/Renamed.md"), file("Templates/Created.md")]); r.vault.trigger("rename");
	expect(labels(r.suggestor.getSuggestions(context("/")))).toEqual(["Renamed", "Created"]);
	r.folders.set("Templates", []); r.vault.trigger("delete");
	expect(r.suggestor.getSuggestions(context("/"))).toEqual([]);
	expect(close).not.toHaveBeenCalled();
});

test.each(["dataview:metadata-change", "dataview:index-ready", "dataview:api-ready"])("Dataview %s enables late API, replacement/removal refresh and fallback recovers unobserved changes", async event => {
	const r = await runtime([{ ...DataviewEntityProvider.getDefaultSettings(), providerInstanceId: "dv" }]);
	expect(r.suggestor.getSuggestions(context())).toEqual([]);
	const pages = (name: string) => ({ pages: jest.fn(() => [{ file: { name, path: `${name}.md`, aliases: [] } }]) });
	const first = pages("Ready");
	r.integrations.dataview = { api: first }; r.metadataCache.trigger(event);
	expect(labels(r.suggestor.getSuggestions(context()))).toEqual(["Ready"]);
	r.integrations.dataview = { api: pages("Replacement") }; r.metadataCache.trigger(event);
	expect(labels(r.suggestor.getSuggestions(context()))).toEqual(["Replacement"]);
	delete r.integrations.dataview; r.metadataCache.trigger(event);
	expect(r.suggestor.getSuggestions(context())).toEqual([]);
	r.integrations.dataview = { api: pages("Fallback") }; jest.advanceTimersByTime(201);
	expect(labels(r.suggestor.getSuggestions(context()))).toEqual(["Fallback"]);
	expect(first.pages).toHaveBeenCalledTimes(1);
	expect(jest.getTimerCount()).toBe(0); // No constructor retry timer or provider scheduler.
});

test.each(["metadata-menu:indexed", "metadata-menu:fileclass-indexed", "metadata-menu:fields-changed"])("Metadata Menu %s handles absent/index-ready/replaced/removed states", async event => {
	const r = await runtime([{ ...MetadataMenuProvider.getDefaultSettings(), providerInstanceId: "mdm" }]);
	expect(r.suggestor.getSuggestions(context("@Bob"))).toEqual([]);
	r.integrations["metadata-menu"] = {};
	expect(r.suggestor.getSuggestions(context("@Bob"))).toEqual([]);
	const indexed = (name: string) => ({ fieldIndex: { fileClassesPath: new Map([["Class.md", { name }]]), fileClassesName: new Map([[name, { name }]]) } });
	r.metadata.set("Class.md", { frontmatter: { newNoteTemplate: "[[Template]]" } });
	r.integrations["metadata-menu"] = indexed("Person"); r.metadataCache.trigger(event);
	expect(labels(r.suggestor.getSuggestions(context("@Bob")))).toEqual(["New Person: Bob"]);
	r.integrations["metadata-menu"] = indexed("Project");
	expect(labels(r.suggestor.getSuggestions(context("@Next")))).toEqual(["New Project: Next"]);
	delete r.integrations["metadata-menu"];
	expect(r.suggestor.getSuggestions(context())).toEqual([]);
});

test("all lifecycle events invalidate data; repeated provider reloads add no listeners; unload prevents revival", async () => {
	const r = await runtime([config("source", { mode: RefreshBehavior.Never })]);
	const listenerCount = (emitter: Events) => Array.from((emitter as unknown as { listeners: Map<string, Set<unknown>> }).listeners.values()).reduce((sum, listeners) => sum + listeners.size, 0);
	for (let i = 0; i < 10; i++) r.plugin.loadEntityProviders();
	expect(listenerCount(r.vault)).toBe(3); expect(listenerCount(r.metadataCache)).toBe(9);
	const retrieve = jest.spyOn(r.registry.getProviders()[0], "getEntityList");
	r.suggestor.getSuggestions(context());
	for (const event of ["changed", "deleted", "resolved", "dataview:metadata-change", "dataview:index-ready", "dataview:api-ready", "metadata-menu:indexed", "metadata-menu:fileclass-indexed", "metadata-menu:fields-changed"]) {
		const calls = retrieve.mock.calls.length;
		r.metadataCache.trigger(event);
		r.suggestor.getSuggestions(context());
		expect(retrieve).toHaveBeenCalledTimes(calls + 1);
	}
	r.layoutCallbacks[0]();
	r.suggestor.getSuggestions(context());
	expect(retrieve).toHaveBeenCalledTimes(11);
	const [old] = r.suggestor.getSuggestions(context());
	r.plugin.unload();
	expect(listenerCount(r.vault) + listenerCount(r.metadataCache)).toBe(0);
	r.layoutCallbacks[0](); r.metadataCache.trigger("dataview:api-ready"); r.plugin.loadEntityProviders();
	expect(r.suggestor.getSuggestions(context())).toEqual([]);
	expect(r.registry.getProviders()).toHaveLength(0);
	r.suggestor.selectSuggestion(old, {} as MouseEvent);
	expect((r.registry as unknown as { changeListeners: Set<unknown> }).changeListeners.size).toBe(0);
});

test("ordinary results retain ranking and same-label deduplication ahead of creation results", async () => {
	const r = await runtime([config("one", { label: "Shared", creation: "Create" }), config("two", { label: "Shared" }), config("three", { label: "Other" })]);
	const result = r.suggestor.getSuggestions(context());
	expect(labels(result)).toEqual(["Shared", "Other", "Create: "]);
	expect(result.map(item => item.match?.score)).toEqual([10, 10, -10]);
});

test.each(["returned text", "", undefined, null])("action return %p retains existing insertion behavior", async returned => {
	const r = await runtime([config("source")]);
	const action = (() => returned) as EntitySuggestionItem["action"];
	jest.spyOn(r.registry.getProviders()[0], "getEntityList").mockReturnValue([{ suggestionText: "Act", action }]);
	const ctx = context();
	r.suggestor.selectSuggestion(r.suggestor.getSuggestions(ctx)[0], {} as MouseEvent);
	await Promise.resolve();
	if (returned == null) expect(ctx.editor.replaceRange).not.toHaveBeenCalled();
	else expect(ctx.editor.replaceRange).toHaveBeenCalledWith(returned, { line: 0, ch: 0 }, ctx.end);
});

test("repeated load/unload lifetimes release event and registry listeners and ignore earlier layout callbacks", async () => {
	const r = await runtime([config("source")]);
	const listenerCount = (emitter: Events) => Array.from((emitter as unknown as { listeners: Map<string, Set<unknown>> }).listeners.values()).reduce((sum, listeners) => sum + listeners.size, 0);
	for (let lifetime = 0; lifetime < 5; lifetime++) {
		if (lifetime) await r.plugin.onload();
		const active = r.plugin.suggestor;
		const invalidate = jest.spyOn(active, "invalidateData");
		r.layoutCallbacks.forEach(callback => callback());
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(listenerCount(r.vault) + listenerCount(r.metadataCache)).toBe(12);
		r.plugin.unload();
		expect(listenerCount(r.vault) + listenerCount(r.metadataCache)).toBe(0);
		expect((r.registry as unknown as { changeListeners: Set<unknown> }).changeListeners.size).toBe(0);
		expect(active.getSuggestions(context())).toEqual([]);
	}
});
