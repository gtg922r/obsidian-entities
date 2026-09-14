import { destroyTestEditors, mountTestEditor, TestEvents } from "./editorTestHarness";
import { EditorBindings } from "../src/editorBindings";
import { App, Editor, EditorSuggestContext, Notice, TFile, TFolder, prepareFuzzySearch } from "obsidian";
import type Entities from "../src/main";
import { EntitiesSuggestor } from "../src/EntitiesSuggestor";
import { EntitySuggestionItem, SuggestionTarget } from "../src/suggestion.types";
import { EntityProvider, EntityProviderUserSettings, RefreshBehavior } from "../src/Providers/EntityProvider";
import ProviderRegistry from "../src/Providers/ProviderRegistry";
import { FolderEntityProvider } from "../src/Providers/FolderEntityProvider";
import { DataviewEntityProvider } from "../src/Providers/DataviewEntityProvider";
import { TemplateEntityProvider } from "../src/Providers/TemplateProvider";
import { CharacterProvider } from "../src/Providers/CharacterProvider";
import { DateEntityProvider } from "../src/Providers/DateEntityProvider";
import moment = require("moment");
import { MetadataMenuProvider } from "../src/Providers/MetadataMenuProvider";
import { TriggerCharacter } from "../src/entities.types";
import { readSuggestionTarget, suggestionTargetKey } from "../src/suggestionTargets";

jest.mock("obsidian", () => ({
	...jest.requireActual("./__mocks__/obsidian"),
	EditorSuggest: class { context: EditorSuggestContext | null = null; close() { this.context = null; } },
	Notice: jest.fn(),
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, ""),
	moment: jest.requireActual("moment"),
	prepareFuzzySearch: jest.fn(),
	setIcon: jest.fn(),
}));
jest.mock("../src/userComponents", () => ({ EntitiesNotice: jest.fn() }));
jest.mock("emojilib", () => ({ __esModule: true, default: { "🐈": ["cat", "cat_face"], "👩🏽‍💻": ["coder", "coding"] } }));

const file = (path: string): TFile => {
	const name = path.split("/").pop()!;
	return Object.assign(new TFile(), { path, name, basename: name.slice(0, name.lastIndexOf(".")), extension: name.split(".").pop()! });
};
const item = (target: SuggestionTarget, suggestionText = "Shared", noteText?: string): EntitySuggestionItem => ({ target, suggestionText, noteText });
const editor = () => ({ transaction: jest.fn(), replaceRange: jest.fn(), setCursor: jest.fn(), posToOffset: jest.fn(() => 0), offsetToPos: jest.fn(() => ({ line: 0, ch: 1 })) }) as unknown as jest.Mocked<Editor>;
const context = (query = "@", path = "Writing/Drafts/Source.md"): EditorSuggestContext => ({ query, editor: editor(), file: file(path), start: { line: 0, ch: 1 }, end: { line: 0, ch: query.length } });

function harness() {
	const files = new Map<string, TFile | TFolder>();
	const folders = new Map<string, TFile[]>();
	const root = Object.assign(new TFolder(), { path: "/", children: [] });
	const metadata = new Map<string, Record<string, unknown>>();
	const integrations: Record<string, unknown> = {};
	const generate = jest.fn(() => "native link");
	const app = {
		workspace: new TestEvents(),
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			getFolderByPath: (path: string) => ({ children: folders.get(path) ?? [] }),
			getRoot: () => root,
		},
		metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: metadata.get(file.path) }), getCache: (path: string) => ({ frontmatter: metadata.get(path) }), getFirstLinkpathDest: jest.fn((path: string) => files.get(path)) },
		plugins: { getPlugin: (id: string) => integrations[id] },
		fileManager: { generateMarkdownLink: generate },
	} as unknown as App;
	const plugin = { app } as Entities;
	let providers: EntityProvider<EntityProviderUserSettings>[] = [];
	let onChange = () => {};
	const registry = { revision: 1, onChange: (cb: () => void) => { onChange = cb; return () => {}; }, getProviders: () => providers, getProvidersForTrigger: (trigger: TriggerCharacter) => providers.filter(p => p.triggers.includes(trigger)) } as unknown as ProviderRegistry;
	const bindings = new EditorBindings(app);
	const suggestor = new EntitiesSuggestor(plugin, registry, bindings);
	const retrieve = suggestor.getSuggestions.bind(suggestor), mounted = new WeakSet<Editor>();
	jest.spyOn(suggestor, "getSuggestions").mockImplementation(ctx => {
		if (!mounted.has(ctx.editor)) {
			files.set(ctx.file.path, ctx.file);
			mountTestEditor(app, bindings, ctx.file, ctx.query, ctx.query, ctx.editor);
			mounted.add(ctx.editor);
		}
		return retrieve(ctx);
	});
	const use = (...rows: EntityProvider<EntityProviderUserSettings>[]) => { providers = rows; };
	const replaceProviders = (...rows: EntityProvider<EntityProviderUserSettings>[]) => { use(...rows); Object.assign(registry, { revision: registry.revision + 1 }); onChange(); };
	const source = (id: string, rows: EntitySuggestionItem[], creation: EntitySuggestionItem[] = []) => ({
		providerInstanceId: id, triggers: [TriggerCharacter.At, TriggerCharacter.Slash, TriggerCharacter.Colon],
		isQueryDependent: false, getRefreshBehavior: () => RefreshBehavior.Never,
		getEntityList: jest.fn(() => rows), getTemplateCreationSuggestions: jest.fn(() => creation),
	}) as unknown as EntityProvider<EntityProviderUserSettings>;
	return { app, plugin, files, folders, metadata, integrations, generate, suggestor, use, source, replaceProviders };
}

afterEach(destroyTestEditors);

beforeEach(() => {
	jest.clearAllMocks();
	jest.mocked(prepareFuzzySearch).mockImplementation(query => text => text.toLowerCase().includes(query.toLowerCase()) ? { score: 10, matches: [] } : null);
});

interface RankingSource {
	id: string;
	ordinary: EntitySuggestionItem[];
	creation: EntitySuggestionItem[];
}

// Accepted eager full-output algorithm, retained only as a test oracle for valid rows.
function eagerOracle(sources: RankingSource[], match: ReturnType<typeof prepareFuzzySearch>): EntitySuggestionItem[] {
	const ordinary: { item: EntitySuggestionItem; id: string }[] = [], creation: typeof ordinary = [];
	for (const source of sources) {
		for (const raw of source.ordinary) {
			const result = match(raw.suggestionText);
			if (result) ordinary.push({ item: { ...raw, target: readSuggestionTarget(raw.target), match: result }, id: source.id });
		}
		for (const raw of source.creation) creation.push({ item: { ...raw, target: readSuggestionTarget(raw.target) }, id: source.id });
	}
	const unique = new Map<string, EntitySuggestionItem>(), files = new Map<TFile, number>();
	for (const { item, id } of [...ordinary, ...creation]) {
		const key = suggestionTargetKey(item.target, id, files), previous = unique.get(key);
		if (!previous || (item.match?.score ?? -10) > (previous.match?.score ?? -10)) unique.set(key, item);
	}
	return [...unique.values()].sort((a, b) => (b.match?.score ?? -10) - (a.match?.score ?? -10));
}

// Observed native host post-retrieval coercion, including its nonempty-before-slice branch.
const hostRows = (rows: EntitySuggestionItem[], limit: number) => limit > 0 && rows.length > limit ? rows.slice(0, limit) : rows;

test.each([1, 2, 100, 1000, 0, -1, Infinity, -Infinity, NaN, 0.5, 1.5, 2.75, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])("limit %p preserves eager oracle order, winners and native coercion", limit => {
	const h = harness(); h.suggestor.limit = limit;
	const row = (key: string, label: string, score?: number): EntitySuggestionItem => ({ ...item({ kind: "text", text: key }, label), ...(score === undefined ? {} : { match: { score, matches: [] } }) });
	const sources: RankingSource[] = [
		{ id: "first", ordinary: [row("A", "A low"), row("B", "B tie"), row("hidden", "Hidden", 900)], creation: [row("C", "creation C", 2), row("missing", "missing"), row("zero", "zero", 0), row("negative", "negative", -12)] },
		{ id: "later", ordinary: [row("A", "A winner"), row("C", "ordinary C")], creation: [row("late", "late high", 9), row("explicit", "explicit")] },
		{ id: "equal", ordinary: [row("A", "A equal loser")], creation: [row("negative", "negative winner", -11)] },
	];
	sources[1].creation[1].match = undefined;
	const match: ReturnType<typeof prepareFuzzySearch> = text => text === "Hidden" ? null : { score: text === "A low" ? 1 : 2, matches: [[0, 1]] };
	jest.mocked(prepareFuzzySearch).mockReturnValue(match);
	h.use(...sources.map(s => h.source(s.id, s.ordinary, s.creation)));
	const expected = eagerOracle(sources, match), result = h.suggestor.getSuggestions(context());
	expect(expected.map(r => r.suggestionText)).toEqual(["late high", "A winner", "B tie", "ordinary C", "zero", "missing", "explicit", "negative winner"]);
	expect(hostRows(result, limit)).toStrictEqual(hostRows(expected, limit));
	expect(result).toStrictEqual(Number.isSafeInteger(limit) && limit > 0 ? expected.slice(0, limit) : expected);
	if (!(Number.isSafeInteger(limit) && limit > 0)) {
		expect(Object.prototype.hasOwnProperty.call(result.find(r => r.suggestionText === "missing")!, "match")).toBe(false);
		expect(Object.prototype.hasOwnProperty.call(result.find(r => r.suggestionText === "explicit")!, "match")).toBe(true);
	}
});

test("fixed-seed mixed-target differential retains full stable ranking across cold and warm caps", () => {
	const h = harness(), files = [file("Same.md"), file("Same.md"), file("Asset.png")];
	const callback = jest.fn(), scores = new Map<string, number | null>();
	let seed = 0x712345;
	const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
	const sources = Array.from({ length: 4 }, (_, p): RankingSource => {
		const rows = Array.from({ length: 240 }, (_, i) => {
			const k = random(40), alias = [undefined, "", "Alias", " Alias ", "Asset.png"][random(5)];
			const targets: SuggestionTarget[] = [{ kind: "file", file: files[k % 3], alias }, { kind: "text", text: `key-${k}` }, { kind: "unresolved-link", linkpath: `key-${k}`, alias }, { kind: "action", id: `key-${k}`, callback }];
			const label = `source-${p}-row-${i}`, row = item(targets[random(4)], label, `metadata-${i}`);
			scores.set(label, random(8) === 0 ? null : random(9) - 12);
			if (random(3)) row.match = { score: random(9) - 12, matches: [[0, 2]] };
			return row;
		});
		return { id: `provider-${p}`, ordinary: rows.slice(0, 200), creation: rows.slice(200) };
	});
	const match: ReturnType<typeof prepareFuzzySearch> = text => scores.get(text) === null ? null : { score: scores.get(text)!, matches: [[1, 3]] };
	jest.mocked(prepareFuzzySearch).mockReturnValue(match);
	const providers = sources.map(s => h.source(s.id, s.ordinary, s.creation)); h.use(...providers);
	const expected = eagerOracle(sources, match), ctx = context();
	for (const limit of [100, 1, 2, 0, 1.75, -1, Infinity, NaN, 1000]) {
		h.suggestor.limit = limit;
		expect(hostRows(h.suggestor.getSuggestions(ctx), limit)).toStrictEqual(hostRows(expected, limit));
	}
	for (const provider of providers) expect(provider.getEntityList).toHaveBeenCalledTimes(1);
	expect(callback).not.toHaveBeenCalled();
});

test("reads inherited limit once per retrieval and observes later overrides", () => {
	const h = harness(), prototype = Object.getPrototypeOf(EntitiesSuggestor.prototype), read = jest.fn(() => 1);
	Object.defineProperty(prototype, "limit", { configurable: true, get: read });
	try {
		h.use(h.source("one", [item({ kind: "text", text: "a" }), item({ kind: "text", text: "b" })]));
		const ctx = context();
		expect(h.suggestor.getSuggestions(ctx)).toHaveLength(1);
		read.mockReturnValue(0);
		expect(h.suggestor.getSuggestions(ctx)).toHaveLength(2);
		expect(read).toHaveBeenCalledTimes(2);
	} finally { delete prototype.limit; }
});

test("keys observe final live file names after every provider's ordinary and creation calls", () => {
	const h = harness(), f = file("Asset.png"), calls: string[] = [];
	const first = h.source("first", [item({ kind: "file", file: f }, "ordinary first")], [item({ kind: "file", file: f, alias: "Renamed.png" }, "creation first")]);
	const later = h.source("later", []);
	for (const p of [first, later]) {
		const ordinary = p.getEntityList("", TriggerCharacter.At), creation = p.getTemplateCreationSuggestions("");
		jest.spyOn(p, "getEntityList").mockImplementation(() => { calls.push(`${p.providerInstanceId}:ordinary`); return ordinary; });
		jest.spyOn(p, "getTemplateCreationSuggestions").mockImplementation(() => {
			calls.push(`${p.providerInstanceId}:creation`);
			if (p === later) f.name = "Renamed.png";
			return creation;
		});
	}
	h.use(first, later); h.suggestor.limit = 1;
	expect(h.suggestor.getSuggestions(context()).map(r => r.suggestionText)).toEqual(["ordinary first"]);
	expect(calls).toEqual(["first:ordinary", "first:creation", "later:ordinary", "later:creation"]);
	// Full output proves the cap did not simply hide an incorrectly distinct creation key.
	h.suggestor.limit = 0; f.name = "Asset.png";
	expect(h.suggestor.getSuggestions(context())).toHaveLength(1);
});

test("capped later-provider file winner retains captured context and fresh cache-detached rows", () => {
	const h = harness(), f = file("Target.md"), ctx = context(); h.files.set(f.path, f);
	jest.mocked(prepareFuzzySearch).mockReturnValue(text => ({ score: text === "winner" ? 20 : 10, matches: [[0, 1]] }));
	const raw = item({ kind: "file", file: f, alias: "Alias" }, "winner", "winning metadata");
	const first = h.source("first", [item({ kind: "file", file: f, alias: "Alias" }, "loser")]), later = h.source("later", [raw]);
	h.use(first, later); h.suggestor.limit = 1;
	const [a] = h.suggestor.getSuggestions(ctx);
	Object.assign(a, { suggestionText: "mutated" }); Object.assign(a.target, { alias: "mutated" });
	raw.suggestionText = "provider mutated"; Object.assign(raw.target, { alias: "provider mutated" });
	const [b] = h.suggestor.getSuggestions(ctx);
	expect(b).not.toBe(a); expect(b.target).not.toBe(a.target); expect(b.target).not.toBe(raw.target);
	expect(b.suggestionText).toBe("winner"); expect(b.noteText).toBe("winning metadata");
	h.suggestor.selectSuggestion(a, {} as MouseEvent); expect(h.generate).not.toHaveBeenCalled();
	h.use(later); // Selection must carry the winning provider identity, not the first key's provider.
	h.suggestor.invalidateData(); h.suggestor.context = context("@", "Wrong.md"); h.suggestor.close();
	h.suggestor.selectSuggestion(b, {} as MouseEvent);
	expect(h.generate).toHaveBeenCalledWith(f, ctx.file.path, undefined, "Alias");
	expect(ctx.editor.transaction).toHaveBeenCalledTimes(1);
	expect(later.getEntityList).toHaveBeenCalledTimes(1);
});

test("provider-scoped actions at the cutoff retain callback identity and continue after data/retrieval changes", async () => {
	const h = harness(), ctx = context();
	let settle!: (value: { status: "target"; target: { kind: "text"; text: string } }) => void;
	const first = jest.fn(() => ({ status: "cancelled" as const }));
	const later = jest.fn(() => new Promise<{ status: "target"; target: { kind: "text"; text: string } }>(resolve => { settle = resolve; }));
	h.use(h.source("first", [item({ kind: "action", id: "same", callback: first })]), h.source("later", [item({ kind: "action", id: "same", callback: later })]));
	h.suggestor.limit = 2;
	const rows = h.suggestor.getSuggestions(ctx);
	expect(rows).toHaveLength(2); expect(first).not.toHaveBeenCalled(); expect(later).not.toHaveBeenCalled();
	expect(rows[1].target).toEqual({ kind: "action", id: "same", callback: later });
	h.suggestor.close(); h.suggestor.selectSuggestion(rows[1], {} as MouseEvent);
	h.suggestor.invalidateData(); h.suggestor.getSuggestions(ctx);
	h.suggestor.selectSuggestion(rows[0], {} as MouseEvent);
	settle({ status: "target", target: { kind: "text", text: "completed" } });
	await Promise.resolve(); await Promise.resolve();
	expect(later).toHaveBeenCalledTimes(1); expect(first).not.toHaveBeenCalled();
	expect(ctx.editor.getValue()).toBe("completed"); expect(ctx.editor.transaction).toHaveBeenCalledTimes(1);
});

test("Folder and Dataview retain duplicate paths/aliases and collapse the identical live file+alias", () => {
	const h = harness();
	const a = file("People/Atlas.md"), b = file("Projects/Atlas.md");
	for (const target of [a, b]) { h.files.set(target.path, target); h.metadata.set(target.path, { aliases: ["Shared alias"] }); }
	h.folders.set("People", [a]); h.folders.set("Projects", [b]);
	h.integrations.dataview = { api: { pages: () => [a, b].map(f => ({ file: { path: f.path, name: f.basename, aliases: ["Shared alias"] } })) } };
	h.use(new FolderEntityProvider(h.plugin, { providerInstanceId: "folder-a", path: "People" }), new FolderEntityProvider(h.plugin, { providerInstanceId: "folder-b", path: "Projects" }), new DataviewEntityProvider(h.plugin, { providerInstanceId: "dv" }));
	expect(h.suggestor.getSuggestions(context()).map(r => r.suggestionText)).toEqual(["Atlas", "Shared alias", "Atlas", "Shared alias"]);
	for (const target of [a, b]) {
		const ctx = context("@Shared");
		const rows = h.suggestor.getSuggestions(ctx);
		const selected = rows.find(row => row.target.kind === "file" && row.target.file === target)!;
		h.suggestor.selectSuggestion(selected, {} as MouseEvent);
		expect(h.generate).toHaveBeenLastCalledWith(target, ctx.file.path, undefined, "Shared alias");
		expect(ctx.editor.getValue()).toBe("native link");
	}
});

test("semantic identity preserves kinds, exact alias bytes and provider-scoped operations", () => {
	const h = harness(), f = file("A/Same.md"), other = file("B/Same.md");
	const aliases = [undefined, "", "Same", "same", " Same ", "A|B", "A\"B", "é", "é"];
	const rows = aliases.map(alias => item({ kind: "file", file: f, alias }));
	rows.push(item({ kind: "file", file: other }), item({ kind: "unresolved-link", linkpath: f.path }), item({ kind: "text", text: f.path }), item({ kind: "action", id: "same", callback: jest.fn() }));
	h.use(h.source("one", [...rows, ...rows]), h.source("two", rows));
	const results = h.suggestor.getSuggestions(context());
	expect(results).toHaveLength(13); // Eight aliases, other file, unresolved, text, two configured actions.
	expect(results.filter(r => r.target.kind === "action")).toHaveLength(2);
});

test("unresolved tuple keys distinguish delimiter-containing fields and never fold aliases", () => {
	const h = harness();
	const targets: SuggestionTarget[] = [
		{ kind: "unresolved-link", linkpath: "a|b", alias: "c" }, { kind: "unresolved-link", linkpath: "a", alias: "b|c" },
		{ kind: "unresolved-link", linkpath: "a" }, { kind: "unresolved-link", linkpath: "a", alias: "" },
		{ kind: "unresolved-link", linkpath: "a", alias: "A" }, { kind: "unresolved-link", linkpath: "a", alias: " a " },
	];
	h.use(h.source("one", targets.map(t => item(t))));
	expect(h.suggestor.getSuggestions(context())).toHaveLength(5);
});

test("dedupe runs after matching, keeps the best score and preserves deterministic provider ties", () => {
	const h = harness(), f = file("A/Note.md");
	jest.mocked(prepareFuzzySearch).mockImplementation(() => text => text === "Hidden" ? null : { score: text === "Best" ? 20 : 10, matches: [] });
	const first = h.source("one", [item({ kind: "file", file: f }, "Hidden"), item({ kind: "file", file: f }, "Fair", "first")]);
	const second = h.source("two", [item({ kind: "file", file: f }, "Best", "winner")]);
	const third = h.source("three", [item({ kind: "file", file: f }, "Best", "tie")]);
	h.use(first, second, third);
	const ctx = context();
	const [winner] = h.suggestor.getSuggestions(ctx);
	expect(winner.noteText).toBe("winner");
	expect(winner.match?.score).toBe(20);
	h.files.set(f.path, f);
	h.suggestor.context = ctx;
	h.suggestor.close();
	h.suggestor.selectSuggestion(winner, {} as MouseEvent);
	expect(h.generate).toHaveBeenCalledTimes(1);
	h.replaceProviders(first); // Existing provenance must belong to the winning provider/revision.
	h.suggestor.selectSuggestion(winner, {} as MouseEvent);
	expect(h.generate).toHaveBeenCalledTimes(1);
});

test("native formatting uses selection-time preferences and each retrieval's source context while reusing raw targets", () => {
	const h = harness(), f = file("People/Zoë 東京.md");
	h.files.set(f.path, f);
	const provider = h.source("one", [item({ kind: "file", file: f, alias: "A [label] | 東京" })]);
	h.use(provider);
	const a = context("@", "Writing/Nested/Source A.md"), b = context("@", "Elsewhere/Source B.md");
	const [rowA] = h.suggestor.getSuggestions(a);
	h.suggestor.context = b; // Active editor is no authority for a previously retrieved row.
	h.generate.mockReturnValue("[A [label] | 東京](../../People/Zoë%20東京.md)");
	h.suggestor.selectSuggestion(rowA, {} as MouseEvent);
	expect(h.generate).toHaveBeenLastCalledWith(f, a.file.path, undefined, "A [label] | 東京");
	expect(a.editor.getValue()).toBe(h.generate.mock.results[0].value);
	expect(b.editor.transaction).not.toHaveBeenCalled();
	const [rowB] = h.suggestor.getSuggestions(b);
	expect(provider.getEntityList).toHaveBeenCalledTimes(1);
	h.generate.mockReturnValue("[[People/Zoë 東京|A [label] | 東京]]");
	h.suggestor.selectSuggestion(rowB, {} as MouseEvent);
	expect(h.generate).toHaveBeenLastCalledWith(f, b.file.path, undefined, "A [label] | 東京");
	expect(b.editor.getValue()).toBe(h.generate.mock.results[1].value);
});

test("attachment default aliases stay visible and share identity with the explicit full filename", () => {
	const h = harness(), f = file("Assets/chart.png"); h.files.set(f.path, f);
	h.use(h.source("one", [undefined, "", "chart.png", "chart", " chart.png "].map(alias => item({ kind: "file", file: f, alias }))));
	const ctx = context(), rows = h.suggestor.getSuggestions(ctx);
	expect(rows).toHaveLength(3);
	h.suggestor.selectSuggestion(rows[0], {} as MouseEvent);
	expect(h.generate).toHaveBeenCalledWith(f, ctx.file.path, undefined, "chart.png");
});

test.each(["rename", "delete", "replace", "format throws", "format empty"])("previously displayed file after background event: %s", change => {
	const h = harness(), f = file("People/Atlas.md"); h.files.set(f.path, f);
	h.use(h.source("one", [item({ kind: "file", file: f })]));
	const ctx = context(), [row] = h.suggestor.getSuggestions(ctx);
	if (change === "rename") { h.files.delete(f.path); f.path = "Moved/Renamed.md"; h.files.set(f.path, f); }
	if (change === "delete") h.files.delete(f.path);
	if (change === "replace") h.files.set(f.path, file(f.path));
	if (change === "format throws") h.generate.mockImplementation(() => { throw new Error("format failed"); });
	if (change === "format empty") h.generate.mockReturnValue("");
	h.suggestor.invalidateData();
	h.suggestor.selectSuggestion(row, {} as MouseEvent);
	if (change === "rename") {
		expect(h.generate).toHaveBeenCalledWith(f, ctx.file.path, undefined, undefined);
		expect(ctx.editor.transaction).toHaveBeenCalledTimes(1);
		expect(Notice).not.toHaveBeenCalled();
	} else {
		expect(ctx.editor.transaction).not.toHaveBeenCalled();
		expect(Notice).toHaveBeenCalledWith(expect.stringMatching(/file|link/), 8000);
		if (change === "delete" || change === "replace") expect(h.generate).not.toHaveBeenCalled();
	}
});

test("deleted and recreated file objects never dedupe even with identical paths", () => {
	const h = harness(); h.use(h.source("one", [item({ kind: "file", file: file("A.md") }), item({ kind: "file", file: file("A.md") })]));
	expect(h.suggestor.getSuggestions(context())).toHaveLength(2);
});

test.each([
	undefined, { kind: "file", file: { path: "Guess.md" } }, { kind: "file", file: new TFolder() },
	{ kind: "unresolved-link", linkpath: 42 }, { kind: "unresolved-link", linkpath: "A", alias: [] },
	{ kind: "text", text: null }, { kind: "action", id: "", callback: () => {} }, { kind: "action", id: "a", callback: true },
	{ kind: "unknown" },
])("malformed target %p cannot suppress a healthy row and is retried", target => {
	const error = jest.spyOn(console, "error").mockImplementation(() => {});
	const h = harness();
	const provider = h.source("one", [item(target as SuggestionTarget), item({ kind: "text", text: "healthy" }, "Healthy")]); h.use(provider);
	for (let i = 0; i < 2; i++) expect(h.suggestor.getSuggestions(context()).map(r => r.suggestionText)).toEqual(["Healthy"]);
	expect(provider.getEntityList).toHaveBeenCalledTimes(2);
	expect(error).toHaveBeenCalledTimes(1); error.mockRestore();
});

test.each(["file", "unresolved-link", "text", "action"] as const)("%s wrappers are detached from both provider and cache while retaining file/callback references", kind => {
	const h = harness(), f = file("Real.md"), callback = jest.fn();
	const target: SuggestionTarget = kind === "file" ? { kind, file: f, alias: "Original" } : kind === "unresolved-link" ? { kind, linkpath: "Original", alias: "Alias" } : kind === "text" ? { kind, text: "Original" } : { kind, id: "original", callback };
	const raw = item(target), provider = h.source("one", [raw]); h.use(provider);
	const [first] = h.suggestor.getSuggestions(context());
	expect(first.target).not.toBe(raw.target);
	Object.assign(first.target, { alias: "Poison", text: "Poison", id: "poison", file: file("Poison.md"), callback: jest.fn(), linkpath: "Poison" });
	Object.assign(raw.target, { alias: "Raw poison", text: "Raw poison", id: "raw poison", file: file("Raw.md"), callback: jest.fn(), linkpath: "Raw" });
	const [next] = h.suggestor.getSuggestions(context());
	expect(provider.getEntityList).toHaveBeenCalledTimes(1);
	if (next.target.kind === "file") { expect(next.target.file).toBe(f); expect(next.target.alias).toBe("Original"); }
	if (next.target.kind === "unresolved-link") expect(next.target).toEqual({ kind, linkpath: "Original", alias: "Alias" });
	if (next.target.kind === "text") expect(next.target.text).toBe("Original");
	if (next.target.kind === "action") { expect(next.target.callback).toBe(callback); expect(next.target.id).toBe("original"); }
});

test("Dataview skips stale paths and folders without guessing from the displayed name", () => {
	const h = harness(), a = file("Real/Atlas.md"); h.files.set(a.path, a); h.files.set("Folder", new TFolder());
	h.integrations.dataview = { api: { pages: () => ["Stale/Atlas.md", "Folder", a.path].map(path => ({ file: { path, name: "Atlas", aliases: [] } })) } };
	const provider = new DataviewEntityProvider(h.plugin, { providerInstanceId: "dv" });
	expect(provider.getEntityList("")).toEqual([expect.objectContaining({ target: { kind: "file", file: a } })]);
	expect(h.app.metadataCache.getFirstLinkpathDest).not.toHaveBeenCalled();
});

test("Character synonyms dedupe literal Unicode without link wrapping", () => {
	const h = harness(); h.use(new CharacterProvider(h.plugin, { providerInstanceId: "chars", suggestFontAwesome: false }));
	for (const [query, literal] of [[":cat", "🐈"], [":cod", "👩🏽‍💻"]]) {
		const ctx = context(query), rows = h.suggestor.getSuggestions(ctx);
		expect(rows).toHaveLength(1); h.suggestor.selectSuggestion(rows[0], {} as MouseEvent);
		expect(ctx.editor.getValue()).toBe(literal);
	}
	expect(h.generate).not.toHaveBeenCalled();
});

test("same-label template actions from two paths and two providers invoke only the chosen callback once", async () => {
	const h = harness(), a = file("A/Same.md"), b = file("B/Same.md"); h.folders.set("A", [a]); h.folders.set("B", [b]);
	const one = new TemplateEntityProvider(h.plugin, { providerInstanceId: "one", path: "A", actionType: "insert" });
	const two = new TemplateEntityProvider(h.plugin, { providerInstanceId: "two", path: "B", actionType: "insert" });
	h.use(one, two);
	for (const [index, target] of [[0, a], [1, b]] as const) {
		const ctx = context("/"), rows = h.suggestor.getSuggestions(ctx);
		expect(rows).toHaveLength(2); expect(rows[index].noteText).toBe(`Insertion unavailable in Entities: ${target.path}`);
		h.suggestor.selectSuggestion(rows[index], {} as MouseEvent); await Promise.resolve();
		expect(Notice).toHaveBeenLastCalledWith(expect.stringContaining(target.path), 8000);
		expect(Notice).toHaveBeenCalledTimes(index + 1);
		expect(ctx.editor.transaction).not.toHaveBeenCalled();
	}
	// Two paths in a single configured source also survive (legacy array paths are supported).
	h.replaceProviders(new TemplateEntityProvider(h.plugin, { providerInstanceId: "both", path: ["A", "B"] as unknown as string, actionType: "insert" }));
	expect(h.suggestor.getSuggestions(context("/"))).toHaveLength(2);
});

test("base template IDs use operative recipe fields and query, not label or persisted row IDs", () => {
	const h = harness();
	const recipe = { engine: "templater" as const, entityName: "Person", templatePath: "Templates/A.md", folderPath: "People" };
	const provider = new FolderEntityProvider(h.plugin, { providerInstanceId: "one", entityCreationTemplates: [recipe, { ...recipe, entityName: "Label only" }, { ...recipe, templatePath: "Templates/B.md" }, { ...recipe, folderPath: "Elsewhere" }] });
	const targets = provider.getTemplateCreationSuggestions("New").map(r => r.target);
	expect(targets[0].kind === "action" && targets[0].id).toBe(targets[1].kind === "action" && targets[1].id);
	expect(new Set(targets.map(t => t.kind === "action" && t.id)).size).toBe(3);
	expect(provider.getEntityList("New")).toEqual([]);
	h.use(provider); expect(h.suggestor.getSuggestions(context("@New"))).toHaveLength(3);
	expect(provider.getTemplateCreationSuggestions("Other")[0].target).not.toEqual(targets[0]);
});

test("Metadata Menu action identity includes file class, template path and query", () => {
	const h = harness(), a = file("Templates/A.md"), b = file("Templates/B.md"); h.files.set(a.path, a); h.files.set(b.path, b);
	const fileClass = { name: "Person", options: { icon: "person" } };
	h.integrations["metadata-menu"] = { fieldIndex: { fileClassesPath: new Map([["Classes/Person.md", fileClass]]), fileClassesName: new Map([["Person", fileClass]]) } };
	h.metadata.set("Classes/Person.md", { newNoteTemplate: "[[Templates/A.md]]" });
	const provider = new MetadataMenuProvider(h.plugin, { providerInstanceId: "mdm" });
	const first = provider.getTemplateCreationSuggestions("New")[0];
	expect(first.noteText).toBe("Create from Templates/A.md");
	expect(first.target.kind === "action" && JSON.parse(first.target.id)).toEqual(["create", "Classes/Person.md", a.path, "New"]);
	h.metadata.set("Classes/Person.md", { newNoteTemplate: "[[Templates/B.md]]" });
	expect(provider.getTemplateCreationSuggestions("New")[0].target).not.toEqual(first.target);
	expect(Notice).not.toHaveBeenCalled();
});

test("real-file rows show the current vault-relative path alongside existing explanatory notes", () => {
	const h = harness(), f = file("People/Atlas.md");
	const text: Record<string, string> = {};
	const element = (cls: string): HTMLElement => ({ addClasses: () => {}, createDiv: ({ cls }: { cls: string }) => element(cls), setText: (value: string) => { text[cls] = value; } }) as unknown as HTMLElement;
	h.suggestor.renderSuggestion(item({ kind: "file", file: f }, "Atlas", "Existing explanation"), element("root"));
	expect(text["suggestion-title"]).toBe("Atlas");
	expect(text["suggestion-note"]).toBe("Existing explanation · People/Atlas.md");
});


test.each([false, true])("Date existing files retain distinct source-relative phrase aliases with creation=%s", (shouldCreateIfNotExists) => {
	const h = harness(), f = file("Calendar/2026-09-13.md");
	h.files.set(f.path, f);
	h.integrations["nldates-obsidian"] = { parseDate: () => {
		const date = moment("2026-09-13"); return { date: date.toDate(), moment: date, formattedString: "2026-09-13" };
	} };
	const getPeriodicNote = jest.fn(() => f);
	const createPeriodicNote = jest.fn();
	h.integrations["periodic-notes"] = { getPeriodicNote, createPeriodicNote, calendarSetManager: {
		getActiveId: () => "Work",
		getActiveGranularities: () => ["day"],
		getActiveConfig: () => ({ enabled: true, folder: "Calendar", format: "YYYY-MM-DD", templatePath: "" }),
		getFormat: () => "YYYY-MM-DD",
	} };
	const provider = new DateEntityProvider(h.plugin, { providerInstanceId: "dates", includeWeekSuggestions: false, shouldCreateIfNotExists });
	h.use(provider);
	jest.mocked(prepareFuzzySearch).mockImplementation(() => () => ({ score: 10, matches: [] }));
	for (const alias of ["today", "this sunday"]) {
		const ctx = context("@today"), rows = h.suggestor.getSuggestions(ctx);
		expect(rows.filter(r => r.suggestionText === "today")).toHaveLength(1);
		const selected = rows.find(r => r.suggestionText === alias)!;
		expect(selected.target).toEqual({ kind: "file", file: f, alias });
		h.suggestor.selectSuggestion(selected, {} as MouseEvent);
		expect(h.generate).toHaveBeenLastCalledWith(f, ctx.file.path, undefined, alias);
	}
	expect(getPeriodicNote).not.toHaveBeenCalled();
	expect(createPeriodicNote).not.toHaveBeenCalled();
});

test.each(["undefined", "reject", "missing-template"])("real recipe selection leaves the sentence untouched on %s creation", async failure => {
	const h = harness(), template = file("Templates/Person.md");
	const root = Object.assign(new TFolder(), { path: "/" });
	Object.assign(h.app.vault, { getRoot: () => root });
	if (failure !== "missing-template") h.files.set(template.path, template);
	const create = jest.fn(async () => {
		if (failure === "reject") throw new Error("engine failed");
		return undefined;
	});
	h.integrations["templater-obsidian"] = { templater: { create_new_note_from_template: create } };
	h.use(new FolderEntityProvider(h.plugin, {
		providerInstanceId: "recipe", path: "People",
		entityCreationTemplates: [{ engine: "templater", templatePath: template.path, entityName: "Person" }],
	}));
	const ctx = context("@Alice");
	jest.mocked(prepareFuzzySearch).mockImplementation(() => () => ({ score: 10, matches: [] }));
	const row = h.suggestor.getSuggestions(ctx).find(item => item.target.kind === "action")!;
	h.suggestor.selectSuggestion(row, {} as MouseEvent);
	for (let i = 0; i < 8; i++) await Promise.resolve();
	expect(ctx.editor.transaction).not.toHaveBeenCalled();
	expect(ctx.editor.setCursor).not.toHaveBeenCalled();
	expect(h.generate).not.toHaveBeenCalled();
});

test("Date no-create rows carry explicit unresolved linkpath/alias and preserve wikilink output", () => {
	const h = harness();
	h.integrations["nldates-obsidian"] = { parseDate: () => undefined };
	h.use(new DateEntityProvider(h.plugin, { providerInstanceId: "dates", shouldCreateIfNotExists: false }));
	const ctx = context("@2026-W21"), rows = h.suggestor.getSuggestions(ctx);
	const selected = rows.find(row => row.target.kind === "unresolved-link" && row.target.alias)!;
	expect(selected.target).toEqual({ kind: "unresolved-link", linkpath: "2026-W21", alias: "2026-W21 (Wk of 5/18)" });
	h.suggestor.selectSuggestion(selected, {} as MouseEvent);
	expect(ctx.editor.getValue()).toBe("[[2026-W21|2026-W21 (Wk of 5/18)]]");
	expect(h.generate).not.toHaveBeenCalled();
});

test("same-label Metadata Menu file classes from distinct paths remain selectable", () => {
	const h = harness(), a = file("Templates/A.md"), b = file("Templates/B.md"); h.files.set(a.path, a); h.files.set(b.path, b);
	const fileClass = { name: "Person" };
	h.integrations["metadata-menu"] = { fieldIndex: { fileClassesPath: new Map([["A/Person.md", fileClass], ["B/Person.md", fileClass]]), fileClassesName: new Map([["Person", fileClass]]) } };
	h.metadata.set("A/Person.md", { newNoteTemplate: "[[Templates/A.md]]" });
	h.metadata.set("B/Person.md", { newNoteTemplate: "[[Templates/B.md]]" });
	h.use(new MetadataMenuProvider(h.plugin, { providerInstanceId: "mdm" }));
	const rows = h.suggestor.getSuggestions(context("@New"));
	expect(rows).toHaveLength(2);
	expect(rows.map(r => r.noteText)).toEqual(["Create from Templates/A.md", "Create from Templates/B.md"]);
});


test("Dataview iterable pages resolve real files and use native cached aliases when enabled", () => {
	const h = harness(), f = file("People/Atlas.md"); h.files.set(f.path, f);
	// DataArray is iterable and has length, but is not a JavaScript Array.
	const iterable = <T>(values: T[]) => ({ length: values.length, *[Symbol.iterator]() { yield* values; } });
	const aliases = iterable(["Navigator", "Zoë 東京"]);
	const pages = iterable([{ file: { path: f.path, name: f.basename, aliases } }]);
	h.integrations.dataview = { api: { pages: () => pages } };
	h.metadata.set(f.path, { aliases: ["Navigator", "Zoë 東京"] });
	h.use(new DataviewEntityProvider(h.plugin, { providerInstanceId: "dv", shouldCreateEntitiesForAliases: true }));
	const rows = h.suggestor.getSuggestions(context());
	expect(rows.map(row => row.suggestionText)).toEqual(["Atlas", "Navigator", "Zoë 東京"]);
	expect(rows[2].target).toEqual({ kind: "file", file: f, alias: "Zoë 東京" });
});

test.each([FolderEntityProvider, DataviewEntityProvider].map(Provider => [Provider.providerTypeID, Provider] as const))("%s finds Issue 9 property aliases and selects one native link transaction", (_name, Provider) => {
	const h = harness(), bob = file("People/Bob Hope.md");
	const create = jest.fn(), rename = jest.fn(), engine = jest.fn();
	Object.assign(h.app.vault, { create, rename });
	h.integrations["templater-obsidian"] = { templater: { create_new_note_from_template: engine } };
	h.files.set(bob.path, bob); h.folders.set("People", [bob]);
	h.metadata.set(bob.path, { ldap: "hopeb@" });
	h.integrations.dataview = { api: { pages: () => [{ file: { path: bob.path } }] } };
	h.use(new Provider(h.plugin, { providerInstanceId: "people", path: "People", shouldCreateEntitiesForAliases: false, propertyToCreateEntitiesFor: "ldap" }));
	const ctx = context("@hop");
	const alias = h.suggestor.getSuggestions(ctx).find(row => row.suggestionText === "hopeb@")!;
	expect(alias.suggestionText).toBe("hopeb@");
	expect(alias.target).toEqual({ kind: "file", file: bob, alias: "hopeb@" });
	h.suggestor.selectSuggestion(alias, {} as MouseEvent);
	expect(h.generate).toHaveBeenCalledWith(bob, ctx.file.path, undefined, "hopeb@");
	expect(ctx.editor.transaction).toHaveBeenCalledTimes(1);
	expect(ctx.editor.getValue()).toBe("native link");
	expect(create).not.toHaveBeenCalled(); expect(rename).not.toHaveBeenCalled(); expect(engine).not.toHaveBeenCalled();
});

test.each([FolderEntityProvider, DataviewEntityProvider].map(Provider => [Provider.providerTypeID, Provider] as const))("%s preserves equal custom aliases across files while collapsing native/custom duplicates", (_name, Provider) => {
	const h = harness(), a = file("People/Bob Hope.md"), b = file("Archive/Bob Hope.md");
	for (const target of [a, b]) { h.files.set(target.path, target); h.metadata.set(target.path, { aliases: ["hopeb@"], ldap: ["hopeb@", "hopeb@"] }); }
	h.folders.set("People", [a, b]);
	h.integrations.dataview = { api: { pages: () => [a, b].map(file => ({ file: { path: file.path } })) } };
	h.use(new Provider(h.plugin, { providerInstanceId: "people", path: "People", shouldCreateEntitiesForAliases: true, propertyToCreateEntitiesFor: "ldap" }));
	const rows = h.suggestor.getSuggestions(context("@hop")).filter(row => row.suggestionText === "hopeb@");
	expect(rows).toHaveLength(2);
	expect(rows.map(row => row.target)).toEqual([a, b].map(file => ({ kind: "file", file, alias: "hopeb@" })));
});

test.each([
	[FolderEntityProvider, "filter"], [FolderEntityProvider, "source"],
	[DataviewEntityProvider, "filter"], [DataviewEntityProvider, "source"],
] as const)("%s invalid ordinary %s retains valid peers and independent creation recipes", (Provider, invalid) => {
	const h = harness(), bob = file("People/Bob Hope.md"), engine = jest.fn();
	h.files.set(bob.path, bob); h.folders.set("People", [bob]);
	h.metadata.set(bob.path, { aliases: ["Leaked alias"] });
	h.integrations["templater-obsidian"] = { templater: { create_new_note_from_template: engine } };
	h.integrations.dataview = { api: { pages: () => { if (invalid === "source") throw new Error("invalid source"); return [{ file: { path: bob.path } }]; } } };
	const provider = new Provider(h.plugin, {
		providerInstanceId: "broken", path: invalid === "source" ? "Missing" : "People", query: "[",
		entityFilters: invalid === "filter" ? [{ type: "exclude", property: "status", value: "[" }] : [],
		entityCreationTemplates: [{ engine: "templater", templatePath: "Templates/Person.md", entityName: "Person" }],
	});
	// The harness's default folder lookup is an empty folder for missing paths; it still yields no ordinary rows.
	h.use(provider, h.source("peer", [item({ kind: "text", text: "peer" }, "Peer")]));
	const results = h.suggestor.getSuggestions(context());
	expect(results.map(row => row.suggestionText)).toEqual(["Peer", "New Person: "]);
	expect(results[1].target.kind).toBe("action");
	expect(provider.isEnabled).toBe(true);
	expect(engine).not.toHaveBeenCalled();
});


test("unchanged Date route remains selectable after native index invalidation", async () => {
	const h = harness(), created = file("Calendar/2026-09-13.md");
	const date = moment("2026-09-13");
	h.integrations["nldates-obsidian"] = { parseDate: () => ({ date: date.toDate(), moment: date, formattedString: "2026-09-13" }) };
	const createPeriodicNote = jest.fn(async () => { h.files.set(created.path, created); return created; });
	h.integrations["periodic-notes"] = {
		getPeriodicNote: jest.fn(() => null), createPeriodicNote,
		calendarSetManager: {
			getActiveId: () => "Work", getActiveGranularities: () => ["day"],
			getActiveConfig: () => ({ enabled: true, format: "YYYY-MM-DD", folder: "Calendar", templatePath: "" }),
			getFormat: () => "YYYY-MM-DD",
		},
	};
	h.use(new DateEntityProvider(h.plugin, { providerInstanceId: "dates", includeWeekSuggestions: false }));
	jest.mocked(prepareFuzzySearch).mockImplementation(() => () => ({ score: 10, matches: [] }));
	const ctx = context("@today"), row = h.suggestor.getSuggestions(ctx).find(row => row.suggestionText === "today")!;
	expect(row.target.kind).toBe("action");
	h.suggestor.invalidateData();
	h.suggestor.selectSuggestion(row, {} as MouseEvent);
	for (let i = 0; i < 8; i++) await Promise.resolve();
	expect(createPeriodicNote).toHaveBeenCalledTimes(1);
	expect(h.generate).toHaveBeenCalledWith(created, ctx.file.path, undefined, "today");
	expect(ctx.editor.transaction).toHaveBeenCalledTimes(1);
});

test.each(["NLP", "Periodic"])("unavailable %s date integration preserves unrelated provider rows", failing => {
	const h = harness();
	const date = moment("2026-09-13");
	h.integrations["nldates-obsidian"] = { parseDate: () => {
		if (failing === "NLP") throw new Error("parser unavailable");
		return { date: date.toDate(), moment: date, formattedString: "2026-09-13" };
	} };
	if (failing === "Periodic") h.integrations["periodic-notes"] = { settings: { daily: { enabled: true } } };
	h.use(new DateEntityProvider(h.plugin, { providerInstanceId: "dates", includeWeekSuggestions: false }), h.source("peer", [item({ kind: "text", text: "Peer" }, "today peer")]));
	const error = jest.spyOn(console, "error").mockImplementation(() => {});
	expect(h.suggestor.getSuggestions(context("@today")).map(row => row.suggestionText)).toEqual(["today peer"]);
	error.mockRestore();
});
