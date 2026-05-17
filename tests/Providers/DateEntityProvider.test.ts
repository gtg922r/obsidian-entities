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

describe("DateEntityProvider", () => {
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
		expect(periodicNotes.createPeriodicNote).not.toHaveBeenCalled();
		expect(generateMarkdownLink).toHaveBeenCalledWith(
			weeklyFile,
			"",
			undefined,
			"this week"
		);
	});
});
