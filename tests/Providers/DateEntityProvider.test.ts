import moment from "moment";
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

function createPluginWithNlDates(nlDatesPlugin: unknown): Plugin {
	return {
		app: {
			plugins: {
				getPlugin: jest.fn(() => nlDatesPlugin),
			},
		},
	} as unknown as Plugin;
}

describe("DateEntityProvider", () => {
	test("returns no suggestions when NLDates does not expose parseDate", () => {
		const plugin = createPluginWithNlDates({
			settings: {
				autocompleteTriggerPhrase: "@",
				isAutosuggestEnabled: true,
			},
		});

		const provider = new DateEntityProvider(plugin, {});

		expect(() => provider.getEntityList("today")).not.toThrow();
		expect(provider.getEntityList("today")).toEqual([]);
	});
});
