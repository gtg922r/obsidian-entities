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
import { insertTemplateUsingTemplater } from "../src/entitiesUtilities";

jest.mock("obsidian", () => ({
	...jest.requireActual("./__mocks__/obsidian"),
	EditorSuggest: class { context: EditorSuggestContext | null = null; close() { this.context = null; } },
	Notice: jest.fn(),
	moment: jest.requireActual("moment"),
	prepareFuzzySearch: jest.fn(),
	setIcon: jest.fn(),
}));
jest.mock("../src/entitiesUtilities", () => ({ createNewNoteFromTemplate: jest.fn(), insertTemplateUsingTemplater: jest.fn(async () => {}) }));
jest.mock("../src/userComponents", () => ({ EntitiesNotice: jest.fn() }));
jest.mock("emojilib", () => ({ __esModule: true, default: { "🐈": ["cat", "cat_face"], "👩🏽‍💻": ["coder", "coding"] } }));

const file = (path: string): TFile => {
	const name = path.split("/").pop()!;
	return Object.assign(new TFile(), { path, name, basename: name.slice(0, name.lastIndexOf(".")), extension: name.split(".").pop()! });
};
const item = (target: SuggestionTarget, suggestionText = "Shared", noteText?: string): EntitySuggestionItem => ({ target, suggestionText, noteText });
const editor = () => ({ replaceRange: jest.fn(), setCursor: jest.fn(), posToOffset: jest.fn(() => 0), offsetToPos: jest.fn(() => ({ line: 0, ch: 1 })) }) as unknown as jest.Mocked<Editor>;
const context = (query = "@", path = "Writing/Drafts/Source.md"): EditorSuggestContext => ({ query, editor: editor(), file: file(path), start: { line: 0, ch: 1 }, end: { line: 0, ch: query.length } });

function harness() {
	const files = new Map<string, TFile | TFolder>();
	const folders = new Map<string, TFile[]>();
	const metadata = new Map<string, Record<string, unknown>>();
	const integrations: Record<string, unknown> = {};
	const generate = jest.fn(() => "native link");
	const app = {
		vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null, getFolderByPath: (path: string) => ({ children: folders.get(path) ?? [] }) },
		metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: metadata.get(file.path) }), getCache: (path: string) => ({ frontmatter: metadata.get(path) }), getFirstLinkpathDest: jest.fn((path: string) => files.get(path)) },
		plugins: { getPlugin: (id: string) => integrations[id] },
		fileManager: { generateMarkdownLink: generate },
	} as unknown as App;
	const plugin = { app } as Entities;
	let providers: EntityProvider<EntityProviderUserSettings>[] = [];
	let onChange = () => {};
	const registry = { revision: 1, onChange: (cb: () => void) => { onChange = cb; return () => {}; }, getProviders: () => providers, getProvidersForTrigger: (trigger: TriggerCharacter) => providers.filter(p => p.triggers.includes(trigger)) } as unknown as ProviderRegistry;
	const suggestor = new EntitiesSuggestor(plugin, registry);
	const use = (...rows: EntityProvider<EntityProviderUserSettings>[]) => { providers = rows; };
	const replaceProviders = (...rows: EntityProvider<EntityProviderUserSettings>[]) => { use(...rows); Object.assign(registry, { revision: registry.revision + 1 }); onChange(); };
	const source = (id: string, rows: EntitySuggestionItem[], creation: EntitySuggestionItem[] = []) => ({
		providerInstanceId: id, triggers: [TriggerCharacter.At, TriggerCharacter.Slash, TriggerCharacter.Colon],
		isQueryDependent: false, getRefreshBehavior: () => RefreshBehavior.Never,
		getEntityList: jest.fn(() => rows), getTemplateCreationSuggestions: jest.fn(() => creation),
	}) as unknown as EntityProvider<EntityProviderUserSettings>;
	return { app, plugin, files, folders, metadata, integrations, generate, suggestor, use, source, replaceProviders };
}

beforeEach(() => {
	jest.clearAllMocks();
	jest.mocked(prepareFuzzySearch).mockImplementation(query => text => text.toLowerCase().includes(query.toLowerCase()) ? { score: 10, matches: [] } : null);
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
		expect(ctx.editor.replaceRange).toHaveBeenCalledWith("native link", { line: 0, ch: 0 }, ctx.end);
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
	expect(a.editor.replaceRange).toHaveBeenCalledWith(h.generate.mock.results[0].value, { line: 0, ch: 0 }, a.end);
	expect(b.editor.replaceRange).not.toHaveBeenCalled();
	const [rowB] = h.suggestor.getSuggestions(b);
	expect(provider.getEntityList).toHaveBeenCalledTimes(1);
	h.generate.mockReturnValue("[[People/Zoë 東京|A [label] | 東京]]");
	h.suggestor.selectSuggestion(rowB, {} as MouseEvent);
	expect(h.generate).toHaveBeenLastCalledWith(f, b.file.path, undefined, "A [label] | 東京");
	expect(b.editor.replaceRange).toHaveBeenCalledWith(h.generate.mock.results[1].value, { line: 0, ch: 0 }, b.end);
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
		expect(ctx.editor.replaceRange).toHaveBeenCalledTimes(1);
		expect(Notice).not.toHaveBeenCalled();
	} else {
		expect(ctx.editor.replaceRange).not.toHaveBeenCalled();
		expect(Notice).toHaveBeenCalledWith(expect.stringMatching(/note|link/));
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
		expect(ctx.editor.replaceRange).toHaveBeenCalledWith(literal, { line: 0, ch: 0 }, ctx.end);
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
		expect(rows).toHaveLength(2); expect(rows[index].noteText).toBe(`Insert ${target.path}`);
		h.suggestor.selectSuggestion(rows[index], {} as MouseEvent); await Promise.resolve();
		expect(insertTemplateUsingTemplater).toHaveBeenLastCalledWith(h.plugin, target);
		expect(insertTemplateUsingTemplater).toHaveBeenCalledTimes(index + 1);
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
	expect(insertTemplateUsingTemplater).not.toHaveBeenCalled();
});

test("real-file rows show the current vault-relative path alongside existing explanatory notes", () => {
	const h = harness(), f = file("People/Atlas.md");
	const text: Record<string, string> = {};
	const element = (cls: string): HTMLElement => ({ addClasses: () => {}, createDiv: ({ cls }: { cls: string }) => element(cls), setText: (value: string) => { text[cls] = value; } }) as unknown as HTMLElement;
	h.suggestor.renderSuggestion(item({ kind: "file", file: f }, "Atlas", "Existing explanation"), element("root"));
	expect(text["suggestion-title"]).toBe("Atlas");
	expect(text["suggestion-note"]).toBe("Existing explanation · People/Atlas.md");
});


test("Date actions keep distinct operative output aliases for the same date", async () => {
	const h = harness(), f = file("Calendar/2026-09-13.md");
	h.files.set(f.path, f);
	h.integrations["nldates-obsidian"] = { parseDate: () => {
		const date = moment("2026-09-13"); return { date: date.toDate(), moment: date, formattedString: "2026-09-13" };
	} };
	const getPeriodicNote = jest.fn(() => f);
	h.integrations["periodic-notes"] = { getPeriodicNote, createPeriodicNote: jest.fn(), calendarSetManager: { getActiveGranularities: () => ["day"] } };
	const provider = new DateEntityProvider(h.plugin, { providerInstanceId: "dates", includeWeekSuggestions: false });
	h.use(provider);
	jest.mocked(prepareFuzzySearch).mockImplementation(() => () => ({ score: 10, matches: [] }));
	for (const alias of ["today", "this sunday"]) {
		const ctx = context("@today"), rows = h.suggestor.getSuggestions(ctx);
		expect(rows.filter(r => r.suggestionText === "today")).toHaveLength(1);
		const selected = rows.find(r => r.suggestionText === alias)!;
		expect(selected.target.kind).toBe("action");
		h.suggestor.selectSuggestion(selected, {} as MouseEvent); await Promise.resolve();
		expect(h.generate).toHaveBeenLastCalledWith(f, ctx.file.path, undefined, alias);
	}
	expect(getPeriodicNote).toHaveBeenCalledTimes(2);
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
	expect(ctx.editor.replaceRange).not.toHaveBeenCalled();
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
	expect(ctx.editor.replaceRange).toHaveBeenCalledWith("[[2026-W21|2026-W21 (Wk of 5/18)]]", { line: 0, ch: 0 }, ctx.end);
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


test("Dataview iterable pages and aliases become synchronous array targets without dropping aliases", () => {
	const h = harness(), f = file("People/Atlas.md"); h.files.set(f.path, f);
	// DataArray is iterable and has length, but is not a JavaScript Array.
	const iterable = <T>(values: T[]) => ({ length: values.length, *[Symbol.iterator]() { yield* values; } });
	const aliases = iterable(["Navigator", "Zoë 東京"]);
	const pages = iterable([{ file: { path: f.path, name: f.basename, aliases } }]);
	h.integrations.dataview = { api: { pages: () => pages } };
	h.use(new DataviewEntityProvider(h.plugin, { providerInstanceId: "dv" }));
	const rows = h.suggestor.getSuggestions(context());
	expect(rows.map(row => row.suggestionText)).toEqual(["Atlas", "Navigator", "Zoë 東京"]);
	expect(rows[2].target).toEqual({ kind: "file", file: f, alias: "Zoë 東京" });
});
