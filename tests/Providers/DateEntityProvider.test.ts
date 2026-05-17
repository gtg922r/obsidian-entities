import moment = require("moment");
import { Plugin } from "obsidian";
import { DateEntityProvider } from "../../src/Providers/DateEntityProvider";

jest.mock("obsidian", () => ({
	Plugin: class {
		app: unknown;
		constructor(app: unknown) {
			this.app = app;
		}
	},
	Setting: class {},
	moment,
}));

jest.mock("../../src/userComponents", () => ({
	EntitiesNotice: jest.fn(),
	IconPickerModal: jest.fn(),
}));

function createPluginWithPlugins(
	pluginsById: Record<string, unknown>,
	fileManager: { generateMarkdownLink?: jest.Mock } = {}
): Plugin {
	return {
		app: {
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

		const provider = new DateEntityProvider(plugin, {});

		expect(() => provider.getEntityList("today")).not.toThrow();
		expect(provider.getEntityList("today")).toEqual([]);
	});

	test("returns an action that links an existing weekly periodic note", async () => {
		freezeMomentNow("2026-05-18");
		const weeklyFile = { path: "Periodic/Weeks/2026-W21.md" };
		const generateMarkdownLink = jest
			.fn()
			.mockReturnValue("[[Periodic/Weeks/2026-W21|this week]]");
		const periodicNotes = {
			calendarSetManager: {
				getActiveGranularities: jest.fn(() => ["week"]),
				getActiveConfig: jest.fn(() => ({
					enabled: true,
					openAtStartup: false,
					format: "gggg-[W]ww",
					folder: "Periodic/Weeks",
				})),
				getFormat: jest.fn(() => "gggg-[W]ww"),
			},
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
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(suggestion?.action).toBeDefined();
		await expect(suggestion?.action?.(suggestion, null)).resolves.toBe(
			"[[Periodic/Weeks/2026-W21|this week]]"
		);
		expect(periodicNotes.getPeriodicNote).toHaveBeenCalledWith(
			"week",
			expect.objectContaining({})
		);
		const periodicNoteDate = periodicNotes.getPeriodicNote.mock.calls[0][1];
		expect(periodicNoteDate.isoWeekYear()).toBe(2026);
		expect(periodicNoteDate.isoWeek()).toBe(21);
		expect(periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
		expect(generateMarkdownLink).toHaveBeenCalledWith(
			weeklyFile,
			"",
			undefined,
			"this week"
		);
	});

	test("returns a wiki-link fallback when periodic note creation does not return a file", async () => {
		freezeMomentNow("2026-05-18");
		const periodicNotes = {
			calendarSetManager: {
				getActiveGranularities: jest.fn(() => ["week"]),
			},
			getPeriodicNote: jest.fn(() => null),
			createPeriodicNote: jest.fn(() => Promise.resolve(undefined)),
		};
		const plugin = createPluginWithPlugins({
			"nldates-obsidian": createNlDatesPlugin(),
			"periodic-notes": periodicNotes,
		});

		const provider = new DateEntityProvider(plugin, {
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(suggestion?.action).toBeDefined();
		await expect(suggestion?.action?.(suggestion, null)).resolves.toBe(
			"[[2026-W21]]"
		);
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
			shouldCreateIfNotExists: true,
		});

		expect(() => provider.getEntityList("this week")).not.toThrow();
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(suggestion?.action).toBeUndefined();
	});

	test("does not add an action when Periodic Notes lacks creation APIs", () => {
		const periodicNotes = {
			calendarSetManager: {
				getActiveGranularities: jest.fn(() => ["week"]),
			},
		};
		const plugin = createPluginWithPlugins({
			"nldates-obsidian": createNlDatesPlugin(),
			"periodic-notes": periodicNotes,
		});

		const provider = new DateEntityProvider(plugin, {
			shouldCreateIfNotExists: true,
		});
		const suggestion = provider
			.getEntityList("this week")
			.find((item) => item.suggestionText === "this week");

		expect(suggestion?.action).toBeUndefined();
	});
});
