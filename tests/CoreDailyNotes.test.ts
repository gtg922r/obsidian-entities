import moment = require("moment");
import { App, ExtraButtonComponent, Plugin, Setting, TAbstractFile, TFile, TFolder } from "obsidian";
import { captureDateRoute, DateRouteSnapshot, dateLinkpath, getDateRouteStatus, lookupDateFile } from "../src/dateNotes";
import { createOrReusePeriodicNote } from "../src/entityCreation";
import { DateEntityProvider } from "../src/Providers/DateEntityProvider";
import { actionContext, getAction } from "./suggestionTestHelpers";

jest.mock("obsidian", () => ({
	Plugin: class {}, Setting: class {},
	TFile: class {},
	TFolder: class { path: string; isRoot() { return this.path === "/"; } },
	moment,
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "") || "/",
}));
jest.mock("../src/userComponents", () => ({ EntitiesNotice: jest.fn(), IconPickerModal: jest.fn() }));

const date = moment("2026-05-17T15:42:00");
const makeFile = (path: string) => Object.assign(new TFile(), { path });
const makeFolder = (path: string) => Object.assign(new TFolder(), { path });

function fixture() {
	const root = makeFolder("/"), daily = makeFolder("Daily"), other = makeFolder("Other");
	const files = new Map<string, TAbstractFile>([["/", root], [daily.path, daily], [other.path, other]]);
	const add = <T extends TAbstractFile>(file: T): T => { files.set(file.path, file); return file; };
	const integrations: Record<string, unknown> = {};
	const options = { format: "YYYY-MM-DD", folder: "Daily", template: "" };
	const create = jest.fn<Promise<unknown>, [moment.Moment]>(async () => add(makeFile("Daily/2026-05-17.md")));
	const instance = { options, getFormat: jest.fn(() => options.format || "YYYY-MM-DD"), getDailyNote: create };
	const wrapper = { enabled: true, instance };
	const native = { current: wrapper as typeof wrapper | undefined };
	const lookupInsensitive = jest.fn((path: string) => Array.from(files.values()).find(file => file.path.toLowerCase() === path.toLowerCase()) ?? null);
	const metadata = jest.fn<TFile | null, [string, string]>(() => null);
	const getNewFileParent = jest.fn(() => root);
	const app = {
		plugins: { getPlugin: jest.fn((id: string) => integrations[id]) },
		internalPlugins: { getPluginById: jest.fn(() => native.current) },
		vault: { getRoot: () => root, getAbstractFileByPath: jest.fn((path: string) => files.get(path) ?? null), getAbstractFileByPathInsensitive: lookupInsensitive },
		metadataCache: { getFirstLinkpathDest: metadata },
		fileManager: { getNewFileParent },
	} as unknown as App;
	return { app, root, daily, other, files, add, options, create, instance, wrapper, native, integrations, lookupInsensitive, metadata, getNewFileParent };
}

function ready(h: ReturnType<typeof fixture>): DateRouteSnapshot {
	const route = captureDateRoute(h.app, "day");
	if (route.kind !== "ready") throw new Error(`Expected a ready route, got ${route.kind}`);
	return route.snapshot;
}

function flat(enabled?: boolean) {
	return { settings: Object.fromEntries(["daily", "weekly", "monthly", "quarterly", "yearly"].map(key =>
		[key, { format: "", folder: "", template: "", ...(enabled === undefined ? {} : { enabled }) }])) };
}

function beta(enabled = true) {
	const config = { enabled, format: "YYYY-MM-DD", folder: "Beta", templatePath: "" };
	return {
		calendarSetManager: {
			getActiveId: () => "work", getActiveGranularities: () => config.enabled ? ["day"] : [],
			getActiveConfig: () => config, getFormat: () => config.format,
		},
		getPeriodicNote: jest.fn(() => null), createPeriodicNote: jest.fn(),
	};
}

test("Core only resolves daily; absence and disabled Core retain unresolved fallback", () => {
	const h = fixture();
	expect(ready(h)).toMatchObject({ engine: "core-daily", granularity: "day", parent: h.daily, parentPath: "Daily" });
	expect(captureDateRoute(h.app, "week")).toEqual({ kind: "none" });
	h.wrapper.enabled = false;
	expect(captureDateRoute(h.app, "day")).toEqual({ kind: "none" });
	h.native.current = undefined;
	expect(captureDateRoute(h.app, "day")).toEqual({ kind: "none" });
});

test("active beta wins and recognized inactive beta permits Core", () => {
	const h = fixture(), periodic = beta(); h.integrations["periodic-notes"] = periodic;
	expect(ready(h).engine).toBe("beta-calendar");
	expect(h.instance.getFormat).not.toHaveBeenCalled();
	periodic.calendarSetManager.getActiveConfig().enabled = false;
	expect(ready(h).engine).toBe("core-daily");
});

test.each([false, undefined])("complete flat disabled default (%s) permits Core without flat engine calls", enabled => {
	const h = fixture(); h.integrations["periodic-notes"] = flat(enabled);
	expect(ready(h).engine).toBe("core-daily");
	expect(captureDateRoute(h.app, "week")).toEqual({ kind: "none" });
});

test.each([
	{}, { settings: {} }, { settings: { daily: { enabled: false } } },
	{ ...flat(false), calendarSetManager: undefined },
	{ ...flat(false), calendarSetManager: beta().calendarSetManager },
	{ ...flat(false), getPeriodicNote: () => null },
	{ settings: { ...flat(false).settings, daily: { format: "", folder: "", template: "", enabled: "false" } } },
	{ settings: { ...flat(false).settings, weekly: undefined } },
	{ settings: { ...flat(false).settings, calendarSets: [] } },
	{ calendarSetManager: {} },
])("unknown, partial, malformed or hybrid Periodic does not redirect: %p", periodic => {
	const h = fixture(); h.integrations["periodic-notes"] = periodic;
	expect(captureDateRoute(h.app, "day")).toMatchObject({ kind: "unavailable", engine: "periodic-notes", reason: "configuration" });
	expect(h.instance.getFormat).not.toHaveBeenCalled();
});

test("active flat remains explicitly unavailable for both daily and weekly", () => {
	const h = fixture(); h.integrations["periodic-notes"] = flat(true);
	for (const granularity of ["day", "week"] as const) expect(captureDateRoute(h.app, granularity)).toEqual({ kind: "unavailable", engine: "periodic-notes", reason: "flat-active" });
});

test.each(["getFormat", "getDailyNote"] as const)("enabled Core with missing %s is unavailable", key => {
	const h = fixture(); delete (h.instance as Partial<typeof h.instance>)[key];
	expect(captureDateRoute(h.app, "day")).toMatchObject({ kind: "unavailable", engine: "core-daily", reason: "capability" });
});

test.each([
	{ format: 42, folder: "Daily", template: "" }, { format: "YYYY", folder: false, template: "" },
	{ format: "YYYY", folder: "Daily", template: [] }, null,
])("malformed native options fail soft: %p", options => {
	const h = fixture(); Object.assign(h.instance, { options });
	expect(captureDateRoute(h.app, "day")).toMatchObject({ kind: "unavailable", engine: "core-daily", reason: "configuration" });
});

test("late native capability recovers, while a throwing native getter fails soft", () => {
	const h = fixture(); h.native.current = undefined;
	expect(captureDateRoute(h.app, "day")).toEqual({ kind: "none" });
	h.native.current = h.wrapper;
	expect(ready(h).engine).toBe("core-daily");
	h.instance.getFormat.mockImplementation(() => { throw new Error("unavailable"); });
	expect(captureDateRoute(h.app, "day")).toMatchObject({ kind: "unavailable", engine: "core-daily" });
	expect(h.create).not.toHaveBeenCalled();
});

test("discovery and pure status perform no native creation or case-insensitive vault scan", () => {
	const h = fixture(), snapshot = ready(h);
	for (let offset = 0; offset < 25; offset++) expect(lookupDateFile(h.app, snapshot, date.clone().add(offset, "day"))).toBeNull();
	expect(h.metadata).toHaveBeenCalledTimes(25);
	expect(h.metadata).toHaveBeenNthCalledWith(1, "Daily/2026-05-17.md", "");
	h.options.format = "[Literal title]";
	const route = captureDateRoute(h.app, "day");
	const reads = h.instance.getFormat.mock.calls.length;
	expect(getDateRouteStatus(route, date)).toEqual({ kind: "ready", engine: "core-daily" });
	expect(h.instance.getFormat).toHaveBeenCalledTimes(reads);
	expect(h.lookupInsensitive).not.toHaveBeenCalled();
	expect(h.create).not.toHaveBeenCalled();
});

test("beta-only status limitation retains its current title", () => {
	const h = fixture(), periodic = beta(); periodic.calendarSetManager.getActiveConfig().format = "[Literal title]";
	h.integrations["periodic-notes"] = periodic;
	expect(getDateRouteStatus(captureDateRoute(h.app, "day"), date)).toEqual({
		kind: "ready", engine: "beta-calendar", limitation: { reason: "date-identity", granularity: "day", format: "[Literal title]", title: "Literal title" },
	});
});

test("exact discovery works without metadata and case-only discovery requires a full live path", () => {
	const h = fixture(), snapshot = ready(h), exact = h.add(makeFile("Daily/2026-05-17.md"));
	expect(lookupDateFile(h.app, snapshot, date)).toBe(exact);
	expect(h.metadata).not.toHaveBeenCalled();
	h.files.delete(exact.path);
	const actual = h.add(makeFile("DAILY/2026-05-17.MD")); h.metadata.mockReturnValue(actual);
	expect(lookupDateFile(h.app, snapshot, date)).toBe(actual);
	expect(h.metadata).toHaveBeenLastCalledWith("Daily/2026-05-17.md", "");
	h.files.delete(actual.path);
	expect(lookupDateFile(h.app, snapshot, date)).toBeNull();
});

test.each(["Other/2026-05-17.md", "Nested/Daily/2026-05-17.md", "2026-05-17.md", "Daily/2026-05-17.md.md"])("metadata rejects basename/suffix matches at %s", path => {
	const h = fixture(), file = h.add(makeFile(path)); h.metadata.mockReturnValue(file);
	expect(lookupDateFile(h.app, ready(h), date)).toBeNull();
});

test("cold case-only metadata shows a miss but selection reuses the authoritative live file", async () => {
	const h = fixture(), actual = h.add(makeFile("DAILY/2026-05-17.MD")), snapshot = ready(h);
	expect(lookupDateFile(h.app, snapshot, date)).toBeNull();
	expect(h.lookupInsensitive).not.toHaveBeenCalled();
	expect(await createOrReusePeriodicNote(h.app, "day", date, { expectedRoute: snapshot })).toEqual({ status: "existing", file: actual });
	expect(h.lookupInsensitive).toHaveBeenCalledTimes(1);
	expect(h.create).not.toHaveBeenCalled();
});

test.each(["Daily/2026-05-17.md", "DAILY/2026-05-17.MD"])("a nonfile collision at %s fails without native creation", async path => {
	const h = fixture(); h.add(makeFolder(path));
	expect((await createOrReusePeriodicNote(h.app, "day", date)).status).toBe("failed");
	expect(h.create).not.toHaveBeenCalled();
});

test("default destination uses the public empty-source parent and its real root identity", () => {
	const h = fixture(); h.options.folder = "";
	expect(dateLinkpath(ready(h), date)).toBe("2026-05-17");
	expect(h.getNewFileParent).toHaveBeenLastCalledWith("");
	expect(h.app.vault.getAbstractFileByPath("")).toBeNull();
	h.getNewFileParent.mockReturnValue(h.other);
	expect(dateLinkpath(ready(h), date)).toBe("Other/2026-05-17");
	h.getNewFileParent.mockReturnValue(makeFolder("Other"));
	expect(captureDateRoute(h.app, "day")).toMatchObject({ kind: "unavailable", reason: "folder" });
});

test.each([" Notes ", "   "])("configured literal folder spaces survive: %p", path => {
	const h = fixture(); h.options.folder = path; h.add(makeFolder(path));
	expect(dateLinkpath(ready(h), date)).toBe(`${path}/2026-05-17`);
	expect(h.getNewFileParent).not.toHaveBeenCalled();
});

test.each(["Missing", "Other/File.md"])("missing or nonfolder destination is unavailable: %s", path => {
	const h = fixture(); h.options.folder = path;
	if (path.endsWith(".md")) h.add(makeFile(path));
	expect(captureDateRoute(h.app, "day")).toMatchObject({ kind: "unavailable", reason: "folder" });
	expect(h.create).not.toHaveBeenCalled();
});

test.each([
	["[  Literal title  ]", "Daily/Literal title"], ["[title.md]", "Daily/title.md"], ["YYYY/MM/DD", "Daily/2026/05/17"],
])("Core preserves native title lookup semantics for %s", (format, linkpath) => {
	const h = fixture(); h.options.format = format;
	const snapshot = ready(h);
	expect(dateLinkpath(snapshot, date)).toBe(linkpath);
	if (format === "[title.md]") expect(() => lookupDateFile(h.app, snapshot, date)).toThrow("Daily Notes format");
	else lookupDateFile(h.app, snapshot, date);
	expect(h.metadata).toHaveBeenLastCalledWith(`${linkpath}.md`, "");
});

test.each(["[title.md]", "[title.MD]", "[   ]", "[Nested//Title]", "[/Title]", "[Title/]"])("incompatible Core title %s preserves existing native paths but never creates missing notes", async format => {
	const h = fixture(); h.options.format = format;
	const route = captureDateRoute(h.app, "day"), snapshot = ready(h), path = `${dateLinkpath(snapshot, date)}.md`;
	expect(getDateRouteStatus(route, date)).toMatchObject({ kind: "ready", engine: "core-daily", limitation: { reason: "title-path" } });
	expect(() => lookupDateFile(h.app, snapshot, date)).toThrow("Daily Notes format");
	expect((await createOrReusePeriodicNote(h.app, "day", date)).status).toBe("failed");
	const nativePathFile = h.add(makeFile(path));
	expect(lookupDateFile(h.app, snapshot, date)).toBe(nativePathFile);
	expect(await createOrReusePeriodicNote(h.app, "day", date)).toEqual({ status: "existing", file: nativePathFile });
	h.files.delete(path);
	expect((await createOrReusePeriodicNote(h.app, "day", date)).status).toBe("failed");
	expect(h.create).not.toHaveBeenCalled();
});

test("a single-suffix file is not reinterpreted as Core's double-suffix native lookup target", async () => {
	const h = fixture(); h.options.format = "[title.md]"; h.add(makeFile("Daily/title.md"));
	expect(() => lookupDateFile(h.app, ready(h), date)).toThrow("Daily Notes format");
	expect((await createOrReusePeriodicNote(h.app, "day", date)).status).toBe("failed");
	expect(h.create).not.toHaveBeenCalled();
});

const mutations: [string, (h: ReturnType<typeof fixture>) => void][] = [
	["wrapper", h => { h.native.current = { ...h.wrapper }; }],
	["instance", h => { h.wrapper.instance = { ...h.instance }; }],
	["disabled", h => { h.wrapper.enabled = false; }],
	["removed", h => { h.native.current = undefined; }],
	["format", h => { h.options.format = "YYYY"; }],
	["folder", h => { h.options.folder = "Other"; }],
	["template", h => { h.options.template = "Changed"; }],
	["getFormat", h => { h.instance.getFormat = jest.fn(() => h.options.format); }],
	["create", h => { h.instance.getDailyNote = jest.fn(); }],
	["case method", h => { Object.assign(h.app.vault, { getAbstractFileByPathInsensitive: () => null }); }],
	["parent replaced", h => { h.files.set("Daily", makeFolder("Daily")); }],
	["parent renamed", h => { h.files.delete("Daily"); h.daily.path = "Moved"; h.files.set("Moved", h.daily); }],
	["active beta", h => { h.integrations["periodic-notes"] = beta(); }],
	["active flat", h => { h.integrations["periodic-notes"] = flat(true); }],
];

test.each(mutations)("retained action refuses %s change", async (_name, mutate) => {
	const h = fixture(), snapshot = ready(h); mutate(h);
	expect((await createOrReusePeriodicNote(h.app, "day", date, { expectedRoute: snapshot })).status).toBe("failed");
	expect(h.create).not.toHaveBeenCalled();
});

test("unchanged strings with a changed default parent refuse retained work", async () => {
	const h = fixture(); h.options.folder = ""; const snapshot = ready(h);
	h.getNewFileParent.mockReturnValue(h.other);
	expect((await createOrReusePeriodicNote(h.app, "day", date, { expectedRoute: snapshot })).status).toBe("failed");
	expect(h.create).not.toHaveBeenCalled();
});

test("equal copied options remain valid; effective format and raw option changes are compared", async () => {
	const h = fixture(), snapshot = ready(h);
	h.instance.options = { ...h.options };
	expect((await createOrReusePeriodicNote(h.app, "day", date, { expectedRoute: snapshot })).status).toBe("created");
	h.files.delete("Daily/2026-05-17.md"); h.create.mockClear();
	h.instance.getFormat.mockReturnValue("YYYY");
	expect((await createOrReusePeriodicNote(h.app, "day", date, { expectedRoute: snapshot })).status).toBe("failed");
	h.instance.getFormat.mockReturnValue(snapshot.format);
	Object.assign(h.instance.options, { format: undefined });
	expect((await createOrReusePeriodicNote(h.app, "day", date, { expectedRoute: snapshot })).status).toBe("failed");
	expect(h.create).not.toHaveBeenCalled();
});

test("authoritative lookup must return a real live full-path match", async () => {
	const h = fixture();
	for (const returned of [makeFile("Daily/2026-05-17.md"), h.add(makeFile("Other/2026-05-17.md"))]) {
		h.lookupInsensitive.mockReturnValue(returned);
		expect((await createOrReusePeriodicNote(h.app, "day", date)).status).toBe("failed");
	}
	expect(h.create).not.toHaveBeenCalled();
});

test("lookup-time configuration changes refuse work and both startup guards can cancel", async () => {
	const h = fixture(), snapshot = ready(h);
	expect(await createOrReusePeriodicNote(h.app, "day", date, { expectedRoute: snapshot, canStartWork: () => false })).toEqual({ status: "cancelled" });
	expect(h.lookupInsensitive).not.toHaveBeenCalled();
	const guard = jest.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
	expect(await createOrReusePeriodicNote(h.app, "day", date, { expectedRoute: snapshot, canStartWork: guard })).toEqual({ status: "cancelled" });
	h.lookupInsensitive.mockImplementation(() => { h.options.template = "Changed"; return null; });
	expect((await createOrReusePeriodicNote(h.app, "day", date, { expectedRoute: snapshot })).status).toBe("failed");
	expect(h.create).not.toHaveBeenCalled();
});

test.each([undefined, null, {}, makeFile("Daily/2026-05-17.md")])("invalid native return fails even when a coincidental file exists: %p", async returned => {
	const h = fixture(); h.create.mockImplementation(async () => { h.add(makeFile("Daily/2026-05-17.md")); return returned; });
	expect((await createOrReusePeriodicNote(h.app, "day", date)).status).toBe("failed");
	expect(h.files.get("Daily/2026-05-17.md")).toBeInstanceOf(TFile);
});

test("native creation retains its receiver, original date and actual renamed outcome", async () => {
	const h = fixture(), original = date.format(), actual = makeFile("Renamed/actual 2.md");
	h.create.mockImplementation(async function(this: unknown, supplied: moment.Moment) {
		expect(this).toBe(h.instance); expect(supplied).not.toBe(date); expect(supplied.format()).toBe(original);
		supplied.add(1, "day"); return h.add(actual);
	});
	expect(await createOrReusePeriodicNote(h.app, "day", date)).toEqual({ status: "created", file: actual });
	expect(date.format()).toBe(original); expect(h.create).toHaveBeenCalledTimes(1);
});

test("native post-write failure preserves the file without claiming success or ownership", async () => {
	const h = fixture(), actual = makeFile("Daily/2026-05-17.md");
	h.create.mockImplementation(async () => { h.add(actual); throw new Error("after write"); });
	expect(await createOrReusePeriodicNote(h.app, "day", date)).toEqual({ status: "failed", error: new Error("after write") });
	expect(h.files.get(actual.path)).toBe(actual);
});

describe("Date provider Core destinations", () => {
	function providerFixture(shouldCreateIfNotExists = true) {
		const h = fixture();
		const nlp = {
			parseDate: jest.fn(() => ({ date: date.toDate(), moment: date, formattedString: "NLP date" })),
			settings: { autocompleteTriggerPhrase: "@", isAutosuggestEnabled: false },
		};
		h.integrations["nldates-obsidian"] = nlp;
		const settings = { ...DateEntityProvider.getDefaultSettings(), shouldCreateIfNotExists };
		const plugin = { app: h.app } as Plugin;
		const provider = new DateEntityProvider(plugin, { ...settings, providerInstanceId: "core-date" });
		const row = (query = "today") => provider.getEntityList(query).find(item => item.suggestionText === query);
		const button = { setIcon: jest.fn(), setTooltip: jest.fn(), onClick: jest.fn(), extraSettingsEl: { removeClass: jest.fn(), addClass: jest.fn() } };
		const setting = { addExtraButton: (callback: (value: ExtraButtonComponent) => void) => callback(button as unknown as ExtraButtonComponent) };
		const render = () => DateEntityProvider.buildSummarySetting(setting as unknown as Setting, settings, jest.fn(), plugin);
		return { ...h, nlp, settings, provider, row, render, button };
	}

	test.each([false, true])("existing exact and metadata case-only files keep phrase aliases with creation=%s", shouldCreate => {
		const h = providerFixture(shouldCreate), file = h.add(makeFile("Daily/2026-05-17.md"));
		expect(h.row()?.target).toEqual({ kind: "file", file, alias: "today" });
		h.files.delete(file.path); file.path = "DAILY/2026-05-17.MD"; h.add(file); h.metadata.mockReturnValue(file);
		expect(h.row()?.target).toEqual({ kind: "file", file, alias: "today" });
		expect(h.create).not.toHaveBeenCalled(); expect(h.lookupInsensitive).not.toHaveBeenCalled();
	});

	test("missing notes respect creation toggle and native configured destination", async () => {
		const off = providerFixture(false);
		expect(off.row()?.target).toEqual({ kind: "unresolved-link", linkpath: "Daily/2026-05-17", alias: "today" });
		const on = providerFixture();
		expect(on.row()?.target.kind).toBe("action");
		expect(on.create).not.toHaveBeenCalled();
		expect(await getAction(on.row())!(actionContext())).toMatchObject({ status: "created", alias: "today", file: { path: "Daily/2026-05-17.md" } });
		expect(on.create).toHaveBeenCalledTimes(1);
	});

	test("cold case-only metadata action reuses the actual file when selected", async () => {
		const h = providerFixture(), file = h.add(makeFile("DAILY/2026-05-17.MD")), selected = h.row();
		expect(selected?.target.kind).toBe("action"); expect(h.lookupInsensitive).not.toHaveBeenCalled();
		expect(await getAction(selected)!(actionContext())).toEqual({ status: "existing", file, alias: "today" });
		expect(h.create).not.toHaveBeenCalled();
	});

	test("captures Core once per evaluation and never scans or creates for presets", () => {
		const h = providerFixture(); h.provider.getEntityList("today");
		expect(h.instance.getFormat).toHaveBeenCalledTimes(1);
		expect(h.metadata.mock.calls.length).toBeGreaterThan(20);
		expect(h.lookupInsensitive).not.toHaveBeenCalled(); expect(h.create).not.toHaveBeenCalled();
	});

	test("Core does not supply weekly destinations or bypass required NLP", () => {
		const h = providerFixture();
		const week = h.row("2026-W21");
		expect(week?.target).toEqual({ kind: "unresolved-link", linkpath: "2026-W21", alias: "2026-W21 (Wk of 5/18)" });
		delete h.integrations["nldates-obsidian"];
		expect(h.provider.getEntityList("today")).toEqual([]);
		h.integrations["nldates-obsidian"] = {};
		expect(h.provider.getEntityList("today")).toEqual([]);
		h.integrations["nldates-obsidian"] = { ...h.nlp };
		expect(h.row()?.target.kind).toBe("action");
		h.wrapper.enabled = false;
		expect(h.row()?.target).toEqual({ kind: "unresolved-link", linkpath: "NLP date", alias: undefined });
		h.wrapper.enabled = true;
		expect(h.row()?.target.kind).toBe("action");
	});

	test("retained provider action refuses a changed default parent", async () => {
		const h = providerFixture(); h.options.folder = ""; const selected = h.row();
		h.getNewFileParent.mockReturnValue(h.other);
		expect((await getAction(selected)!(actionContext())).status).toBe("failed"); expect(h.create).not.toHaveBeenCalled();
	});

	test.each([false, true])("literal titles work, while suffix-limited missing rows stay absent with creation=%s", shouldCreate => {
		const h = providerFixture(shouldCreate); h.options.format = "[  Literal title  ]";
		expect(h.row()?.noteText).toBe("Literal title");
		h.render(); expect(h.button.setIcon).toHaveBeenLastCalledWith("package-check");
		h.options.format = "[title.md]";
		expect(h.row()).toBeUndefined();
		h.render(); expect(h.button.setTooltip).toHaveBeenLastCalledWith(expect.stringContaining("Daily Notes cannot resolve missing notes"));
		expect(h.button.extraSettingsEl.addClass).toHaveBeenLastCalledWith("entities-validation-status-warning");
		const file = h.add(makeFile("Daily/title.md.md"));
		expect(h.row()?.target).toEqual({ kind: "file", file, alias: "today" });
		expect(h.create).not.toHaveBeenCalled(); expect(h.lookupInsensitive).not.toHaveBeenCalled();
	});

	test.each(["NLP", "conflict", "folder"])("summary preserves %s error precedence over title limitation", problem => {
		const h = providerFixture(); h.options.format = "[title.md]";
		if (problem === "NLP") delete h.integrations["nldates-obsidian"];
		if (problem === "conflict") h.nlp.settings.isAutosuggestEnabled = true;
		if (problem === "folder") h.options.folder = "Missing";
		h.render();
		expect(h.button.setTooltip).toHaveBeenCalledWith(problem === "NLP" ? "NLDates plugin not found" : problem === "conflict" ?
			"NLDates plugin conflicts with autocomplete!" : "Daily Notes folder unavailable; check Daily Notes settings");
		expect(h.button.extraSettingsEl.addClass).toHaveBeenCalledWith("entities-validation-status-error");
		expect(h.nlp.parseDate).not.toHaveBeenCalled(); expect(h.metadata).not.toHaveBeenCalled();
		expect(h.lookupInsensitive).not.toHaveBeenCalled(); expect(h.create).not.toHaveBeenCalled();
	});
});
