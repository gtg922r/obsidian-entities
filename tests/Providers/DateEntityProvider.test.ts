import { actionContext, getAction } from "../suggestionTestHelpers";
import moment = require("moment");
import { Plugin, TFile, TFolder } from "obsidian";
import { DateEntityProvider } from "../../src/Providers/DateEntityProvider";
import { EntitiesNotice } from "../../src/userComponents";

jest.mock("obsidian", () => ({
	Plugin: class {
		app: unknown;
		constructor(app: unknown) {
			this.app = app;
		}
	},
	Setting: class {},
	TFile: class {},
	TFolder: class {},
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, ""),
	moment,
}));

jest.mock("../../src/userComponents", () => ({
	EntitiesNotice: jest.fn(),
	IconPickerModal: jest.fn(),
}));

type Granularity = "day" | "week";
interface CalendarConfig {
	enabled: boolean;
	format: string;
	folder?: string;
	templatePath?: string;
}

// Current beta manager methods read the active set and return its per-granularity config.
function createCalendarManager(active: Granularity[] = ["week"], weekFormat = "gggg-[W]ww") {
	const state = {
		activeId: "Work",
		configs: {
			day: { enabled: active.includes("day"), format: "YYYY-MM-DD", folder: "Periodic/Days", templatePath: "Templates/Day.md" },
			week: { enabled: active.includes("week"), format: weekFormat, folder: "Periodic/Weeks", templatePath: "Templates/Week.md" },
		} satisfies Record<Granularity, CalendarConfig>,
	};
	return {
		state,
		getActiveId: jest.fn(() => state.activeId),
		getActiveConfig: jest.fn((granularity: Granularity): CalendarConfig => state.configs[granularity]),
		getFormat: jest.fn((granularity: Granularity) => state.configs[granularity].format || (granularity === "day" ? "YYYY-MM-DD" : "gggg-[W]ww")),
		getActiveGranularities: jest.fn(() => (["day", "week"] as const).filter(granularity => state.configs[granularity].enabled)),
	};
}

function createPluginWithPlugins(
	pluginsById: Record<string, unknown>,
	fileManager: { generateMarkdownLink?: jest.Mock } = {}
): Plugin {
	const liveFiles = new Map<string, TFile>();
	const periodic = pluginsById["periodic-notes"] as { getPeriodicNote?: (...args: unknown[]) => TFile; createPeriodicNote?: (...args: unknown[]) => Promise<TFile> } | undefined;
	for (const method of ["getPeriodicNote", "createPeriodicNote"] as const) {
		const original = periodic?.[method];
		if (original && jest.isMockFunction(original)) {
			const implementation = original.getMockImplementation();
			original.mockImplementation((...args: unknown[]) => {
				const add = (file: TFile) => { if (file) liveFiles.set(file.path, file); return file; };
				const result = implementation?.(...args);
				return result instanceof Promise ? result.then(add) : add(result);
			});
		}
	}
	return {
		app: {
			vault: { getAbstractFileByPath: (path: string) => liveFiles.get(path) },
			plugins: {
				getPlugin: jest.fn((pluginId: string) => pluginsById[pluginId]),
			},
			fileManager,
		},
	} as unknown as Plugin;
}

function createNlDatesPlugin() {
	return {
		parseDate: jest.fn((date: string) => {
			const parsed = moment(date, ["YYYY-MM-DD"], true);
			const resolved = parsed.isValid() ? parsed : moment("2026-05-17");
			return {
				formattedString: resolved.format("YYYY-MM-DD"),
				date: resolved.toDate(),
				moment: resolved,
			};
		}),
		settings: {
			autocompleteTriggerPhrase: "@",
			isAutosuggestEnabled: false,
		},
	};
}

function freezeMomentNow(date: string): void {
	moment.now = () => new Date(`${date}T00:00:00`).getTime();
}

describe("DateEntityProvider", () => {
	const originalMomentNow = moment.now;

	afterEach(() => {
		moment.now = originalMomentNow;
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});

	test("returns no suggestions when NLDates does not expose parseDate", () => {
		const plugin = createPluginWithPlugins({
			"nldates-obsidian": {
				settings: {
					autocompleteTriggerPhrase: "@",
					isAutosuggestEnabled: true,
				},
			},
		});

		const provider = new DateEntityProvider(plugin, { providerInstanceId: "test-instance" });

		expect(() => provider.getEntityList("today")).not.toThrow();
		expect(provider.getEntityList("today")).toEqual([]);
	});

	test.each([false, true])("returns an existing weekly file with creation=%s", (shouldCreateIfNotExists) => {
		freezeMomentNow("2026-05-18");
		const weeklyFile = Object.assign(new TFile(), { path: "Periodic/Weeks/2026-W21.md" });
		const generateMarkdownLink = jest
			.fn()
			.mockReturnValue("[[Periodic/Weeks/2026-W21|this week]]");
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["week"]),
			getPeriodicNote: jest.fn(() => weeklyFile),
			createPeriodicNote: jest.fn(),
		};
		const plugin = createPluginWithPlugins(
			{
				"nldates-obsidian": createNlDatesPlugin(),
				"periodic-notes": periodicNotes,
			},
			{ generateMarkdownLink }
		);

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists,
		});
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(suggestion?.target).toEqual({ kind: "file", file: weeklyFile, alias: "this week" });
		expect(periodicNotes.getPeriodicNote).toHaveBeenCalledWith(
			"week",
			expect.objectContaining({})
		);
		const periodicNoteDate = periodicNotes.getPeriodicNote.mock.calls[0][1];
		expect(periodicNoteDate.isoWeekYear()).toBe(2026);
		expect(periodicNoteDate.format("gggg-[W]ww")).toBe("2026-W21");
		expect(periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
		expect(generateMarkdownLink).not.toHaveBeenCalled();
	});

	test("looks up the configured representative on locale week boundaries", () => {
		freezeMomentNow("2026-05-17");
		const weeklyFile = Object.assign(new TFile(), { path: "Periodic/Weeks/2026-W21.md" });
		const generateMarkdownLink = jest
			.fn()
			.mockReturnValue("[[Periodic/Weeks/2026-W21|this week]]");
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["week"]),
			getPeriodicNote: jest.fn(() => weeklyFile),
			createPeriodicNote: jest.fn(),
		};
		const plugin = createPluginWithPlugins(
			{
				"nldates-obsidian": createNlDatesPlugin(),
				"periodic-notes": periodicNotes,
			},
			{ generateMarkdownLink }
		);

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(moment().format("gggg-[W]ww")).toBe("2026-W21");
		expect(moment().startOf("isoWeek").format("gggg-[W]ww")).toBe(
			"2026-W20"
		);
		expect(suggestion?.noteText).toBe("2026-W21");
		expect(suggestion?.target).toEqual({ kind: "file", file: weeklyFile, alias: "this week" });
		expect(periodicNotes.getPeriodicNote).toHaveBeenCalledWith(
			"week",
			expect.objectContaining({})
		);
		const periodicNoteDate = periodicNotes.getPeriodicNote.mock.calls[0][1];
		expect(periodicNoteDate.format("gggg-[W]ww")).toBe("2026-W21");
		expect(periodicNoteDate.format("YYYY-MM-DD")).toBe("2026-05-17");
		expect(periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
	});

	test("creates a missing weekly periodic note before inserting the link", async () => {
		freezeMomentNow("2026-05-18");
		const weeklyFile = Object.assign(new TFile(), { path: "Periodic/Weeks/2026-W22.md" });
		const generateMarkdownLink = jest
			.fn()
			.mockReturnValue("[[Periodic/Weeks/2026-W22|next week]]");
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["week"]),
			getPeriodicNote: jest.fn(() => null),
			createPeriodicNote: jest.fn(async () => weeklyFile),
		};
		const plugin = createPluginWithPlugins(
			{
				"nldates-obsidian": createNlDatesPlugin(),
				"periodic-notes": periodicNotes,
			},
			{ generateMarkdownLink }
		);

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("next week")
			.find((item) => item.suggestionText === "next week");

		await expect(getAction(suggestion)?.(actionContext())).resolves.toEqual({ status: "created", file: weeklyFile, alias: "next week" });
		expect(periodicNotes.createPeriodicNote).toHaveBeenCalledWith(
			"week",
			expect.objectContaining({})
		);
		const periodicNoteDate = periodicNotes.createPeriodicNote.mock.calls[0][1];
		expect(periodicNoteDate.isoWeekYear()).toBe(2026);
		expect(periodicNoteDate.isoWeek()).toBe(22);
		expect(generateMarkdownLink).not.toHaveBeenCalled();
	});

	test("adds periodic note actions for explicit parsed week suggestions", async () => {
		freezeMomentNow("2026-05-17");
		const weeklyFile = Object.assign(new TFile(), { path: "Periodic/Weeks/2026-W21.md" });
		const generateMarkdownLink = jest
			.fn()
			.mockReturnValue("[[Periodic/Weeks/2026-W21|week 21]]");
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["week"]),
			getPeriodicNote: jest.fn(() => null),
			createPeriodicNote: jest.fn(async () => weeklyFile),
		};
		const plugin = createPluginWithPlugins(
			{
				"nldates-obsidian": createNlDatesPlugin(),
				"periodic-notes": periodicNotes,
			},
			{ generateMarkdownLink }
		);

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("week 21")
			.find((item) => item.suggestionText === "week 21");

		expect(suggestion?.noteText).toBe("2026-W21 (Wk of 5/18)");
		expect(getAction(suggestion)).toBeDefined();
		await expect(getAction(suggestion)?.(actionContext())).resolves.toEqual({ status: "created", file: weeklyFile, alias: "week 21" });
		expect(periodicNotes.getPeriodicNote).toHaveBeenCalledWith(
			"week",
			expect.objectContaining({})
		);
		const getPeriodicNoteDate = periodicNotes.getPeriodicNote.mock.calls[periodicNotes.getPeriodicNote.mock.calls.length - 1][1];
		expect(getPeriodicNoteDate.format("YYYY-MM-DD")).toBe("2026-05-17");
		expect(periodicNotes.createPeriodicNote).toHaveBeenCalledWith(
			"week",
			expect.objectContaining({})
		);
		const createPeriodicNoteDate =
			periodicNotes.createPeriodicNote.mock.calls[0][1];
		expect(createPeriodicNoteDate.format("YYYY-MM-DD")).toBe("2026-05-18");
	});

	test("creates a missing daily periodic note before inserting the link", async () => {
		freezeMomentNow("2026-05-18");
		const dailyFile = Object.assign(new TFile(), { path: "Periodic/Days/2026-05-18.md" });
		const generateMarkdownLink = jest
			.fn()
			.mockReturnValue("[[Periodic/Days/2026-05-18|today]]");
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["day"]),
			getPeriodicNote: jest.fn(() => null),
			createPeriodicNote: jest.fn(async () => dailyFile),
		};
		const nlDates = createNlDatesPlugin();
		nlDates.parseDate.mockImplementation((date: string) => {
			const parsed =
				date === "today"
					? moment()
					: moment(date, ["YYYY-MM-DD"], true);
			const resolved = parsed.isValid() ? parsed : moment("2026-05-17");
			return {
				formattedString: resolved.format("YYYY-MM-DD"),
				date: resolved.toDate(),
				moment: resolved,
			};
		});
		const plugin = createPluginWithPlugins(
			{
				"nldates-obsidian": nlDates,
				"periodic-notes": periodicNotes,
			},
			{ generateMarkdownLink }
		);

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("today")
			.find((item) => item.suggestionText === "today");

		expect(getAction(suggestion)).toBeDefined();
		await expect(getAction(suggestion)?.(actionContext())).resolves.toEqual({ status: "created", file: dailyFile, alias: "today" });
		expect(periodicNotes.createPeriodicNote).toHaveBeenCalledWith(
			"day",
			expect.objectContaining({})
		);
		const periodicNoteDate = periodicNotes.createPeriodicNote.mock.calls[0][1];
		expect(periodicNoteDate.format("YYYY-MM-DD")).toBe("2026-05-18");
		expect(generateMarkdownLink).not.toHaveBeenCalled();
	});

	test("returns no replacement when periodic note creation does not return a file", async () => {
		freezeMomentNow("2026-05-18");
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["week"]),
			getPeriodicNote: jest.fn(() => null),
			createPeriodicNote: jest.fn(() => Promise.resolve(undefined)),
		};
		const plugin = createPluginWithPlugins({
			"nldates-obsidian": createNlDatesPlugin(),
			"periodic-notes": periodicNotes,
		});

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(getAction(suggestion)).toBeDefined();
		await expect(getAction(suggestion)?.(actionContext())).resolves.toMatchObject({ status: "failed" });
	});

	test("looks up configured missing notes with creation disabled", () => {
		freezeMomentNow("2026-05-18");
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["week"]),
			getPeriodicNote: jest.fn(() => null),
			createPeriodicNote: jest.fn(),
		};
		const plugin = createPluginWithPlugins({
			"nldates-obsidian": createNlDatesPlugin(),
			"periodic-notes": periodicNotes,
		});

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists: false,
		});
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(getAction(suggestion)).toBeUndefined();
		expect(suggestion?.target).toEqual({ kind: "unresolved-link", linkpath: "Periodic/Weeks/2026-W21", alias: "this week" });
		expect(periodicNotes.getPeriodicNote).toHaveBeenCalled();
		expect(periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
	});

	test("does not add an action when week granularity is inactive", () => {
		freezeMomentNow("2026-05-18");
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["day"]),
			getPeriodicNote: jest.fn(() => null),
			createPeriodicNote: jest.fn(),
		};
		const plugin = createPluginWithPlugins({
			"nldates-obsidian": createNlDatesPlugin(),
			"periodic-notes": periodicNotes,
		});

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(getAction(suggestion)).toBeUndefined();
		expect(suggestion?.target).toEqual({ kind: "unresolved-link", linkpath: "2026-W21" });
		expect(periodicNotes.getPeriodicNote).not.toHaveBeenCalledWith("week", expect.anything());
		expect(periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
	});

	test("returns no replacement when periodic note creation throws", async () => {
		freezeMomentNow("2026-05-18");
		const error = new Error("creation failed");
		const consoleErrorSpy = jest
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["week"]),
			getPeriodicNote: jest.fn(() => null),
			createPeriodicNote: jest.fn(async () => {
				throw error;
			}),
		};
		const plugin = createPluginWithPlugins({
			"nldates-obsidian": createNlDatesPlugin(),
			"periodic-notes": periodicNotes,
		});

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(getAction(suggestion)).toBeDefined();
		await expect(getAction(suggestion)?.(actionContext())).resolves.toMatchObject({ status: "failed" });
		expect(consoleErrorSpy).not.toHaveBeenCalled();
		expect(EntitiesNotice).not.toHaveBeenCalled();

		consoleErrorSpy.mockRestore();
	});

	test("does not turn a failed semantic week creation into an unresolved link", async () => {
		freezeMomentNow("2026-05-17");
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["week"]),
			getPeriodicNote: jest.fn(() => null),
			createPeriodicNote: jest.fn(async () => undefined),
		};
		const plugin = createPluginWithPlugins({
			"nldates-obsidian": createNlDatesPlugin(),
			"periodic-notes": periodicNotes,
		});

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(suggestion?.noteText).toBe("2026-W21");
		await expect(getAction(suggestion)?.(actionContext())).resolves.toMatchObject({ status: "failed" });
	});

	test("does not add an action when Periodic Notes lacks active granularity API", () => {
		const periodicNotes = {
			calendarSetManager: {},
			getPeriodicNote: jest.fn(() => null),
			createPeriodicNote: jest.fn(),
		};
		const plugin = createPluginWithPlugins({
			"nldates-obsidian": createNlDatesPlugin(),
			"periodic-notes": periodicNotes,
		});

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists: true,
		});

		expect(() => provider.getEntityList("this week")).not.toThrow();
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(getAction(suggestion)).toBeUndefined();
	});

	test("does not add an action when Periodic Notes lacks creation APIs", () => {
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["week"]),
		};
		const plugin = createPluginWithPlugins({
			"nldates-obsidian": createNlDatesPlugin(),
			"periodic-notes": periodicNotes,
		});

		const provider = new DateEntityProvider(plugin, {
			providerInstanceId: "test-instance",
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(getAction(suggestion)).toBeUndefined();
	});
});

test("re-resolves NLP and Periodic Notes capabilities on each evaluation", () => {
	const integrations: Record<string, unknown> = {};
	const provider = new DateEntityProvider(createPluginWithPlugins(integrations), { providerInstanceId: "late-date" });
	expect(provider.getEntityList("today")).toEqual([]);
	const nlp = createNlDatesPlugin();
	integrations["nldates-obsidian"] = nlp;
	expect(provider.getEntityList("today").find(item => item.suggestionText === "today")?.noteText).toBe("2026-05-17");
	const periodic = (format: string) => ({
		calendarSetManager: createCalendarManager(["week"], format),
		getPeriodicNote: jest.fn(), createPeriodicNote: jest.fn(),
	});
	integrations["periodic-notes"] = periodic("[First week ]GGGG-[W]WW");
	let week = provider.getEntityList("today").find(item => item.suggestionText === "this week")!;
	expect(week.noteText).toBe(moment().format("[First week ]GGGG-[W]WW")); expect(getAction(week)).toBeDefined();
	integrations["periodic-notes"] = periodic("[Replacement week ]GGGG-[W]WW");
	week = provider.getEntityList("today").find(item => item.suggestionText === "this week")!;
	expect(week.noteText).toBe(moment().format("[Replacement week ]GGGG-[W]WW"));
	integrations["periodic-notes"] = {}; // Partial API is unavailable.
	expect(provider.getEntityList("today").find(item => item.suggestionText === "this week")).toBeUndefined();
	const replacementNlp = createNlDatesPlugin();
	integrations["nldates-obsidian"] = replacementNlp;
	nlp.parseDate.mockClear();
	provider.getEntityList("today");
	expect(nlp.parseDate).not.toHaveBeenCalled(); expect(replacementNlp.parseDate).toHaveBeenCalled();
	delete integrations["nldates-obsidian"];
	expect(provider.getEntityList("today")).toEqual([]);
});

describe("current periodic date route regressions", () => {
	const originalMomentNow = moment.now;
	const originalLocale = moment.locale();

	beforeEach(() => {
		freezeMomentNow("2026-05-17");
		moment.locale("en");
	});
	afterEach(() => {
		moment.now = originalMomentNow;
		moment.locale(originalLocale);
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});

	function routeFixture(active: Granularity[] = ["day", "week"]) {
		const calendarSetManager = createCalendarManager(active, "GGGG-[W]WW");
		const createdFile = Object.assign(new TFile(), { path: "Periodic/Weeks/2026-W20.md" });
		const periodicNotes = {
			calendarSetManager,
			getPeriodicNote: jest.fn((_granularity: Granularity, _date: moment.Moment): TFile | null => null),
			createPeriodicNote: jest.fn(async (_granularity: Granularity, _date: moment.Moment) => createdFile),
		};
		const nlp = createNlDatesPlugin();
		const integrations: Record<string, unknown> = { "nldates-obsidian": nlp, "periodic-notes": periodicNotes };
		const plugin = createPluginWithPlugins(integrations);
		const provider = new DateEntityProvider(plugin, { providerInstanceId: "routes" });
		return { periodicNotes, nlp, integrations, plugin, provider, createdFile };
	}

	const explicitWeeks = [
		["2021-01-01", "2021-W01", "2021-01-04"],
		["2024-12-31", "2024-W01", "2024-01-01"],
		["2026-05-17", "2020-W53", "2020-12-28"],
		["2026-05-17", "20-W53", "2020-12-28"],
		["2026-05-17", "W15", "2027-04-12"],
		["2026-05-17", "W16", "2026-04-13"],
		["2021-01-01", "W52", "2020-12-21"],
		["2024-12-31", "W01", "2024-12-30"],
		["2026-05-17", "2026 week 1", "2025-12-29"],
		["2026-05-17", "2026wk1", "2025-12-29"],
		["2026-05-17", "26 WK 01", "2025-12-29"],
		["2026-05-17", "  2026-W01  ", "2025-12-29"],
	];

	test.each(explicitWeeks.flatMap(row => ["en", "en-gb"].map(locale => [locale, ...row])))(
		"explicit ISO week in %s on %s parses %s as Monday %s without NLP",
		async (locale, now, query, expected) => {
			moment.locale(locale);
			freezeMomentNow(now);
			const h = routeFixture(["week"]);
			const rows = h.provider.getEntityList(query).filter(row => row.suggestionText.trim() === query.trim());
			expect(getAction(rows[0])).toBeDefined();
			await getAction(rows[0])!(actionContext());
			const requested = h.periodicNotes.getPeriodicNote.mock.calls.filter(([granularity]) => granularity === "week").pop()?.[1];
			expect(requested?.format("YYYY-MM-DD")).toBe(expected);
			expect(requested?.isoWeekday()).toBe(1);
			expect(rows).toHaveLength(1);
			expect(h.nlp.parseDate.mock.calls.some(([value]) => value.trim() === query.trim())).toBe(false);
		}
	);

	test.each([
		"W00", "2021-W53", "2026-W54", "2026-W100", "2026-W01garbage",
		"prefix2026-W01", "2026-W01-W02", "w", "WK", "week", "2026-W", "26 wk", "2026-week",
	])("recognized invalid numeric week %s cannot recover through a successful NLP parser", query => {
		const h = routeFixture();
		const rows = h.provider.getEntityList(query);
		expect(rows.find(row => row.suggestionText === query)).toBeUndefined();
		expect(h.nlp.parseDate).not.toHaveBeenCalledWith(query);
	});

	test.each(["2026-W01", "week 21", "W00", "2026-W100"])("disabled week suggestions do not route %s through NLP", query => {
		const h = routeFixture();
		const provider = new DateEntityProvider(h.plugin, { providerInstanceId: "no-weeks", includeWeekSuggestions: false });
		expect(provider.getEntityList(query).find(row => row.suggestionText === query)).toBeUndefined();
		expect(h.nlp.parseDate).not.toHaveBeenCalledWith(query);
		expect(h.periodicNotes.getPeriodicNote).not.toHaveBeenCalledWith("week", expect.anything());
	});

	test.each(["this week", "last week", "next week", "this monday", "tomorrow", "in two weeks", "2024-02-29", "tomorrow 2026", "May 2026"])(
		"ordinary natural query %s remains outside the numeric-week rejection category", query => {
			const h = routeFixture();
			expect(h.provider.getEntityList(query).find(row => row.suggestionText === query)).toBeDefined();
			if (!/^(this|last|next) week$/.test(query)) expect(h.nlp.parseDate).toHaveBeenCalledWith(query);
		}
	);

	test.each(["2024-02-29T12:34:56-08:00", "2024-03-10T12:34:56-07:00"])("preserves the NLP leap-day/DST creation Moment %s with representative lookup", async iso => {
		const h = routeFixture(["day"]);
		const parsed = moment.parseZone(iso);
		h.nlp.parseDate.mockReturnValue({ date: parsed.toDate(), moment: parsed, formattedString: "NLP display" });
		const row = h.provider.getEntityList("a natural date").find(row => row.suggestionText === "a natural date");
		await getAction(row)!(actionContext());
		expect(h.periodicNotes.getPeriodicNote).toHaveBeenCalled();
		expect(h.periodicNotes.getPeriodicNote.mock.calls.every(([, date]) => date.format("YYYY-MM-DD") === parsed.format("YYYY-MM-DD"))).toBe(true);
		expect(h.periodicNotes.getPeriodicNote.mock.calls.every(([, date]) => date.hour() === 0)).toBe(true);
		expect(h.periodicNotes.createPeriodicNote.mock.calls[0][1].format()).toBe(iso);
		expect(parsed.format()).toBe(iso);
	});

	test.each([false, true].flatMap(includeWeekSuggestions => [
		["in 1 week", "2026-05-24"], ["1 week ago", "2026-05-10"], ["1 week from now", "2026-05-24"],
		["next week 2pm", "2026-05-24"], ["this week at 2pm", "2026-05-17"],
		["in 2 weeks", "2026-05-31"], ["2 weeks ago", "2026-05-03"],
	].map(([query, expected]) => [includeWeekSuggestions, query, expected] as const)))(
		"preserves NLP meaning with week suggestions=%s for %s as %s", (includeWeekSuggestions, query, expected) => {
			freezeMomentNow("2026-05-17");
			const h = routeFixture(["day"]);
			// Actual NLDates 0.6.4 outputs from both native host Moments in the review probe.
			const date = moment(`${expected}T12:00:00`);
			h.nlp.parseDate.mockReturnValue({ date: date.toDate(), moment: date, formattedString: expected });
			const provider = new DateEntityProvider(h.plugin, { providerInstanceId: "relative-week", includeWeekSuggestions,
				shouldCreateIfNotExists: false });
			const rows = provider.getEntityList(query).filter(row => row.suggestionText === query);
			expect(h.nlp.parseDate).toHaveBeenCalledWith(query);
			expect(rows).toHaveLength(1);
			expect(rows[0].target).toEqual({ kind: "unresolved-link", linkpath: `Periodic/Days/${expected}`, alias: query });
		}
	);

	test("rejects an invalid parsed Moment before lookup", () => {
		const h = routeFixture();
		h.nlp.parseDate.mockReturnValue({ date: new Date("2026-05-17"), moment: moment.invalid(), formattedString: "Invalid date" });
		expect(h.provider.getEntityList("broken parse").find(row => row.suggestionText === "broken parse")).toBeUndefined();
		expect(h.periodicNotes.getPeriodicNote).not.toHaveBeenCalledWith("day", expect.anything());
	});

	test.each([false, true].flatMap(shouldCreateIfNotExists => [undefined, null, 42].map(createCapability => [shouldCreateIfNotExists, createCapability] as const)))("lookup-only resolves existing files with creation=%s and create capability=%s", (shouldCreateIfNotExists, createCapability) => {
		const h = routeFixture();
		const files = {
			day: Object.assign(new TFile(), { path: "Real daily.md" }),
			week: Object.assign(new TFile(), { path: "Real weekly.md" }),
		};
		Object.assign(h.plugin.app.vault, { getAbstractFileByPath: (path: string) => Object.values(files).find(file => file.path === path) });
		h.periodicNotes.getPeriodicNote.mockImplementation(granularity => files[granularity]);
		Reflect.set(h.periodicNotes, "createPeriodicNote", createCapability);
		const provider = new DateEntityProvider(h.plugin, { providerInstanceId: "lookup-only", shouldCreateIfNotExists });
		const rows = provider.getEntityList("today");
		expect(rows.find(row => row.suggestionText === "today")?.target).toEqual({ kind: "file", file: files.day, alias: "today" });
		expect(rows.find(row => row.suggestionText === "this week")?.target).toEqual({ kind: "file", file: files.week, alias: "this week" });
	});

	test.each([undefined, null, 42])("lookup-only missing note with create capability=%s retains literal configured path and phrase alias", createCapability => {
		const h = routeFixture();
		h.periodicNotes.calendarSetManager.state.configs.day.folder = " Periodic / Days ";
		h.periodicNotes.calendarSetManager.state.configs.day.format = "[ date ]YYYY-MM-DD[ ]";
		Reflect.set(h.periodicNotes, "createPeriodicNote", createCapability);
		const row = h.provider.getEntityList("today").find(row => row.suggestionText === "today");
		expect(row?.target).toEqual({ kind: "unresolved-link", linkpath: " Periodic / Days / date 2026-05-17 ", alias: "today" });
	});

	test.each(["missing", "empty"])("native %s folder/template defaults preserve the configured root route", defaults => {
		const h = routeFixture(["day"]);
		const config = h.periodicNotes.calendarSetManager.state.configs.day;
		for (const field of ["folder", "templatePath", "format"] as const) {
			if (defaults === "missing") Reflect.deleteProperty(config, field);
			else config[field] = "";
		}
		Reflect.deleteProperty(h.periodicNotes, "createPeriodicNote");
		const row = h.provider.getEntityList("today").find(row => row.suggestionText === "today");
		expect(row?.target).toEqual({ kind: "unresolved-link", linkpath: "2026-05-17", alias: "today" });
	});

	test("an equal replacement config object does not disable the retained route", async () => {
		const h = routeFixture(["week"]);
		const row = h.provider.getEntityList("2026-W21").find(row => row.suggestionText === "2026-W21");
		const state = h.periodicNotes.calendarSetManager.state;
		state.configs.week = { ...state.configs.week };
		await expect(getAction(row)!(actionContext())).resolves.toMatchObject({ status: "created", file: h.createdFile });
		expect(h.periodicNotes.createPeriodicNote).toHaveBeenCalledTimes(1);
	});

	test("captures effective config once per used granularity in an evaluation", () => {
		const h = routeFixture();
		h.provider.getEntityList("today");
		for (const granularity of ["day", "week"] as const) {
			expect(h.periodicNotes.calendarSetManager.getActiveConfig.mock.calls.filter(([value]) => value === granularity)).toHaveLength(1);
			expect(h.periodicNotes.calendarSetManager.getFormat.mock.calls.filter(([value]) => value === granularity)).toHaveLength(1);
		}
	});

	test.each([
		"plugin", "manager", "lookup method", "create method", "config method", "format method", "active ID method", "granularities method",
		"active ID", "folder", "format", "template", "disabled", "lookup throws",
	])("retained missing-note action refuses changed %s before native creation", async change => {
		const h = routeFixture();
		const row = h.provider.getEntityList("2026-W21").find(row => row.suggestionText === "2026-W21");
		const action = getAction(row);
		expect(action).toBeDefined();
		const manager = h.periodicNotes.calendarSetManager;
		const create = h.periodicNotes.createPeriodicNote;
		if (change === "plugin") h.integrations["periodic-notes"] = { ...h.periodicNotes };
		if (change === "manager") h.periodicNotes.calendarSetManager = createCalendarManager(["day", "week"], "GGGG-[W]WW");
		if (change === "lookup method") h.periodicNotes.getPeriodicNote = jest.fn(() => null);
		if (change === "create method") h.periodicNotes.createPeriodicNote = jest.fn(async () => h.createdFile);
		if (change === "config method") manager.getActiveConfig = jest.fn(granularity => manager.state.configs[granularity]);
		if (change === "format method") manager.getFormat = jest.fn(granularity => manager.state.configs[granularity].format);
		if (change === "active ID method") manager.getActiveId = jest.fn(() => manager.state.activeId);
		if (change === "granularities method") manager.getActiveGranularities = jest.fn(() => ["day", "week"]);
		if (change === "active ID") manager.state.activeId = "Home";
		if (change === "folder") manager.state.configs.week.folder = "Changed/Weeks";
		if (change === "format") manager.state.configs.week.format = "[Changed-]GGGG-[W]WW";
		if (change === "template") manager.state.configs.week.templatePath = "Templates/Changed.md";
		if (change === "disabled") manager.state.configs.week.enabled = false;
		if (change === "lookup throws") h.periodicNotes.getPeriodicNote.mockImplementation(() => { throw new Error("index unavailable"); });
		const result = await action!(actionContext());
		expect(result.status).toMatch(/^(unavailable|failed)$/);
		expect(create).not.toHaveBeenCalled();
		expect(h.periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
		const fresh = h.provider.getEntityList("2026-W21").find(row => row.suggestionText === "2026-W21");
		if (change === "disabled") expect(fresh?.target.kind).toBe("unresolved-link");
		else if (change === "lookup throws") expect(getAction(fresh)).toBeUndefined();
		else expect(getAction(fresh)).toBeDefined();
	});

	test.each(["folder", "format", "templatePath", "enabled"])("malformed weekly %s leaves a valid daily route available", field => {
		const h = routeFixture();
		Reflect.set(h.periodicNotes.calendarSetManager.state.configs.week, field, 42);
		const rows = h.provider.getEntityList("2026-W21");
		expect(rows.find(row => row.suggestionText === "2026-W21")).toBeUndefined();
		expect(rows.find(row => row.suggestionText === "this week")).toBeUndefined();
		expect(getAction(rows.find(row => row.suggestionText === "today"))).toBeDefined();
		expect(h.periodicNotes.getPeriodicNote).not.toHaveBeenCalledWith("week", expect.anything());
	});

	test("throwing weekly config leaves a valid daily route available", () => {
		const h = routeFixture();
		h.periodicNotes.calendarSetManager.getActiveConfig.mockImplementation(granularity => {
			if (granularity === "week") throw new Error("bad week config");
			return h.periodicNotes.calendarSetManager.state.configs.day;
		});
		const rows = h.provider.getEntityList("2026-W21");
		expect(rows.find(row => row.suggestionText === "2026-W21")).toBeUndefined();
		expect(getAction(rows.find(row => row.suggestionText === "today"))).toBeDefined();
	});

	test("lookup mutation cannot change a retained explicit-week creation date", async () => {
		const h = routeFixture(["week"]);
		h.periodicNotes.getPeriodicNote.mockImplementation((_granularity, date) => { date.add(10, "weeks"); return null; });
		const row = h.provider.getEntityList("2026-W21").find(row => row.suggestionText === "2026-W21");
		await expect(getAction(row)!(actionContext())).resolves.toMatchObject({ status: "created", file: h.createdFile, alias: "2026-W21" });
		expect(h.periodicNotes.createPeriodicNote.mock.calls[0][1].format("YYYY-MM-DD")).toBe("2026-05-18");
	});
});

describe("configured date identity and native cache lookup", () => {
	const originalMomentNow = moment.now;
	const originalLocale = moment.locale();

	beforeEach(() => {
		freezeMomentNow("2026-05-17");
		moment.locale("en");
	});
	afterEach(() => {
		moment.now = originalMomentNow;
		moment.locale(originalLocale);
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});

	function fixture(format = "GGGG-[W]WW", shouldCreateIfNotExists = false) {
		const files = new Map<string, TFile | TFolder>();
		const entries: { file: TFile; date: moment.Moment }[] = [];
		const periodicNotes = {
			calendarSetManager: createCalendarManager(["week"], format),
			// Beta cache matches in the Moment's locale week, even for ISO filename formats.
			getPeriodicNote: jest.fn((_granularity: Granularity, date: moment.Moment) => entries.find(entry => entry.date.isSame(date, "week"))?.file ?? null),
			createPeriodicNote: jest.fn(async (_granularity: Granularity, date: moment.Moment) => {
				const file = Object.assign(new TFile(), { path: `Periodic/Weeks/${date.format(format)}.md` });
				files.set(file.path, file);
				return file;
			}),
		};
		const plugin = createPluginWithPlugins({ "nldates-obsidian": createNlDatesPlugin(), "periodic-notes": periodicNotes });
		Object.assign(plugin.app.vault, { getAbstractFileByPath: (path: string) => files.get(path) });
		const provider = new DateEntityProvider(plugin, { providerInstanceId: "cache-identity", shouldCreateIfNotExists });
		const addFile = (path: string, indexedDate?: string) => {
			const file = Object.assign(new TFile(), { path });
			files.set(path, file);
			if (indexedDate) entries.push({ file, date: moment(indexedDate) });
			return file;
		};
		const weekRow = () => provider.getEntityList("this week").find(row => row.suggestionText === "this week" && row.icon === "calendar-range");
		return { files, entries, periodicNotes, provider, addFile, weekRow };
	}

	test.each([false, true])("exact configured file wins over a wrong-week native cache match with creation=%s", shouldCreateIfNotExists => {
		const h = fixture("GGGG-[W]WW", shouldCreateIfNotExists);
		const expected = h.addFile("Periodic/Weeks/2026-W20.md", "2026-05-11");
		h.addFile("Periodic/Weeks/2026-W21.md", "2026-05-18");
		expect(h.weekRow()?.target).toEqual({ kind: "file", file: expected, alias: "this week" });
		expect(h.periodicNotes.getPeriodicNote.mock.calls.filter(([, date]) => date.format("GGGG-[W]WW") === "2026-W20")).toHaveLength(0);
		expect(h.periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
	});

	test.each([false, true])("uncached exact configured file remains a real file with creation=%s", shouldCreateIfNotExists => {
		const h = fixture("GGGG-[W]WW", shouldCreateIfNotExists);
		const expected = h.addFile("Periodic/Weeks/2026-W20.md");
		expect(h.entries).toHaveLength(0);
		expect(h.weekRow()?.target).toEqual({ kind: "file", file: expected, alias: "this week" });
		expect(h.periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
	});

	test.each(["folder", "plain object"])("exact configured %s conflict cannot redirect to native cache", kind => {
		const h = fixture("GGGG-[W]WW", true);
		const path = "Periodic/Weeks/2026-W20.md";
		h.files.set(path, kind === "folder" ? Object.assign(new TFolder(), { path }) : { path } as TFile);
		h.addFile("Archive/Current week.md", "2026-05-17");
		expect(h.weekRow()).toBeUndefined();
		expect(h.periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
	});

	test("retained missing-note action reuses a newly appeared uncached canonical file", async () => {
		const h = fixture("GGGG-[W]WW", true);
		const action = getAction(h.weekRow());
		expect(action).toBeDefined();
		const expected = h.addFile("Periodic/Weeks/2026-W20.md");
		await expect(action!(actionContext())).resolves.toEqual({ status: "existing", file: expected, alias: "this week" });
		expect(h.periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
	});

	test("retained missing-note action refuses a newly appeared canonical folder", async () => {
		const h = fixture("GGGG-[W]WW", true);
		const action = getAction(h.weekRow());
		expect(action).toBeDefined();
		const path = "Periodic/Weeks/2026-W20.md";
		h.files.set(path, Object.assign(new TFolder(), { path }));
		await expect(action!(actionContext())).resolves.toMatchObject({ status: "failed" });
		expect(h.periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
	});

	test.each([
		["en", "GGGG-[W]WW", "2026-05-11", "2026-05-10", "2026-05-17", "20"],
		["en", "gggg-[W]ww", "2026-05-17", "2026-05-10", "2026-05-17", "21"],
		["en-gb", "GGGG-[W]WW", "2026-05-11", "2026-05-11", "2026-05-18", "20"],
		["en-gb", "gggg-[W]ww", "2026-05-11", "2026-05-11", "2026-05-18", "20"],
	])("%s %s representative %s preserves native frontmatter mapping", (locale, format, representative, week20, week21, selected) => {
		moment.locale(locale);
		const h = fixture(format);
		const files = [h.addFile("Archive/Log 20.md", week20), h.addFile("Archive/Log 21.md", week21)];
		expect(h.weekRow()?.target).toEqual({ kind: "file", file: files[selected === "20" ? 0 : 1], alias: "this week" });
		expect(h.periodicNotes.getPeriodicNote.mock.calls[0][1].format("YYYY-MM-DD")).toBe(representative);
		expect(h.periodicNotes.getPeriodicNote.mock.calls[0][1].locale()).toBe(locale);
	});

	test("representative ISO lookup keeps original Sunday for native creation and templates", async () => {
		const h = fixture("GGGG-[W]WW", true);
		const action = getAction(h.weekRow());
		await expect(action!(actionContext())).resolves.toMatchObject({ status: "created", alias: "this week" });
		const lookupDate = h.periodicNotes.getPeriodicNote.mock.calls[h.periodicNotes.getPeriodicNote.mock.calls.length - 1][1];
		expect(lookupDate.format("YYYY-MM-DD")).toBe("2026-05-11");
		expect(h.periodicNotes.createPeriodicNote.mock.calls[0][1].format("YYYY-MM-DD")).toBe("2026-05-17");
	});

	test.each([
		["[constant]", "2026-05-17", "constant"],
		["YYYY-[W]ww", "2021-01-01", "2021-W01"],
	])("unrepresentable format %s still resolves an exact real file", (format, now, title) => {
		freezeMomentNow(now);
		const h = fixture(format, true);
		const expected = h.addFile(`Periodic/Weeks/${title}.md`);
		expect(h.weekRow()?.target).toEqual({ kind: "file", file: expected, alias: "this week" });
		expect(h.periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
	});

	test.each([
		["[constant]", "2026-05-17"],
		["YYYY-[W]ww", "2021-01-01"],
	])("missing unrepresentable format %s is unavailable before creation", (format, now) => {
		freezeMomentNow(now);
		const h = fixture(format, true);
		expect(h.weekRow()).toBeUndefined();
		expect(h.periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
	});
});
