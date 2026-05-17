# Periodic Notes Date Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dates entity provider create missing daily and weekly notes through the Periodic Notes plugin when `shouldCreateIfNotExists` is enabled.

**Architecture:** Keep `DateEntityProvider` responsible for parsing and suggestion construction, but add a narrow typed adapter for the Periodic Notes plugin surface. Suggestions continue to insert normal wiki links when Periodic Notes is unavailable, disabled for a granularity, or date creation is disabled; otherwise they use `EntitySuggestionItem.action` to create or link the Periodic Notes file and return the final markdown link.

**Tech Stack:** TypeScript, Obsidian plugin APIs, optional Periodic Notes plugin API, Moment, Jest with existing Obsidian mocks.

---

## External API Notes

Periodic Notes exposes the methods Entities needs on the plugin instance:

- `createPeriodicNote(granularity, date)` creates a note using Periodic Notes' active calendar set, folder, format, and template.
- `getPeriodicNote(granularity, date)` returns an existing note from Periodic Notes' cache.
- `calendarSetManager.getActiveGranularities()` reports which granularities are enabled.

Use this API instead of reading or reimplementing Periodic Notes template settings. The current upstream source is at `https://github.com/liamcain/obsidian-periodic-notes`.

## File Structure

- Modify `src/entities.types.ts`
  - Add local TypeScript interfaces for the small Periodic Notes API surface this plugin consumes.
  - Keep the dependency optional and structural; do not add Periodic Notes as a package dependency.
- Modify `src/Providers/DateEntityProvider.ts`
  - Detect Periodic Notes alongside NLDates.
  - Convert date/week matches into typed date suggestion candidates.
  - Wrap candidates with an `action` only when creation is enabled and Periodic Notes supports the candidate granularity.
  - Create missing notes through Periodic Notes and insert a generated markdown link.
  - Improve week date rollover by deriving semantic weeks from Moment dates instead of string arithmetic.
- Modify `tests/Providers/DateEntityProvider.test.ts`
  - Add focused tests for missing plugin fallback, existing note linking, missing note creation, disabled granularity fallback, and creation failure fallback.
- No changes to `src/EntitiesSuggestor.ts`
  - The existing `action` contract already supports async note creation and returning final replacement text.

---

### Task 1: Baseline And Periodic Notes Types

**Files:**
- Modify: `src/entities.types.ts`
- Test: `tests/Providers/DateEntityProvider.test.ts`

- [ ] **Step 1: Run the current baseline tests**

Run:

```bash
npm test
```

Expected: all existing test suites pass. On 2026-05-17 in the planning worktree, this passed with 10 suites and 131 tests.

- [ ] **Step 2: Add Periodic Notes structural types**

In `src/entities.types.ts`, change the import and add the Periodic Notes interfaces after `TemplaterPlugin`.

```ts
import { App, Plugin, TFile, moment } from "obsidian";
```

```ts
export type PeriodicNotesGranularity =
	| "day"
	| "week"
	| "month"
	| "quarter"
	| "year";

export interface PeriodicNotesConfig {
	enabled: boolean;
	openAtStartup: boolean;
	format: string;
	folder: string;
	templatePath?: string;
}

export interface PeriodicNotesCalendarSetManager {
	getActiveGranularities(): PeriodicNotesGranularity[];
	getActiveConfig(granularity: PeriodicNotesGranularity): PeriodicNotesConfig;
	getFormat(granularity: PeriodicNotesGranularity): string;
}

export interface PeriodicNotesPlugin extends Plugin {
	calendarSetManager?: PeriodicNotesCalendarSetManager;
	createPeriodicNote?: (
		granularity: PeriodicNotesGranularity,
		date: moment.Moment
	) => Promise<TFile>;
	getPeriodicNote?: (
		granularity: PeriodicNotesGranularity,
		date: moment.Moment
	) => TFile | null;
}
```

- [ ] **Step 3: Add a test scaffold that can look up plugins by ID**

Replace `createPluginWithNlDates` in `tests/Providers/DateEntityProvider.test.ts` with this version so later tests can provide both `nldates-obsidian` and `periodic-notes`.

```ts
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
```

Update the existing test setup:

```ts
const plugin = createPluginWithPlugins({
	"nldates-obsidian": {
		settings: {
			autocompleteTriggerPhrase: "@",
			isAutosuggestEnabled: true,
		},
	},
});
```

- [ ] **Step 4: Run the date provider tests**

Run:

```bash
npm test -- tests/Providers/DateEntityProvider.test.ts
```

Expected: the existing date provider test passes.

- [ ] **Step 5: Commit the type/test scaffold**

```bash
git add src/entities.types.ts tests/Providers/DateEntityProvider.test.ts
git commit -m "test: prepare date provider periodic notes mocks"
```

---

### Task 2: Add Periodic Note Link Actions For Existing Notes

**Files:**
- Modify: `src/Providers/DateEntityProvider.ts`
- Test: `tests/Providers/DateEntityProvider.test.ts`

- [ ] **Step 1: Write a failing test for linking an existing weekly note**

Add this test inside `describe("DateEntityProvider", () => { ... })`.

```ts
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
```

Add this helper near the test plugin helper:

```ts
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
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npm test -- tests/Providers/DateEntityProvider.test.ts --runInBand
```

Expected: fail because `this week` suggestions do not yet have an `action`.

- [ ] **Step 3: Detect Periodic Notes in the date provider**

In `src/Providers/DateEntityProvider.ts`, expand imports:

```ts
import { EditorSuggestContext, Plugin, Setting, TFile, moment } from "obsidian";
import { AppWithPlugins, PeriodicNotesGranularity, PeriodicNotesPlugin } from "src/entities.types";
```

Add fields and candidate type near the existing `NLPlugin` interface:

```ts
interface DateSuggestionCandidate {
	suggestionText: string;
	noteText: string;
	replacementText: string;
	icon: string;
	granularity: PeriodicNotesGranularity;
	date: moment.Moment;
	linkAlias: string;
}
```

Add a provider field:

```ts
private periodicNotesPlugin: PeriodicNotesPlugin | undefined;
```

Update `initialize()`:

```ts
private initialize() {
	const appWithPlugins = this.plugin.app as AppWithPlugins;
	const nlpPlugin = appWithPlugins.plugins?.getPlugin(
		"nldates-obsidian"
	) as Partial<NLPlugin> | undefined;
	if (!nlpPlugin || typeof nlpPlugin.parseDate !== "function") {
		this.nlpPlugin = undefined;
	} else {
		this.nlpPlugin = nlpPlugin as NLPlugin;
	}

	const periodicNotesPlugin = appWithPlugins.plugins?.getPlugin(
		"periodic-notes"
	) as Partial<PeriodicNotesPlugin> | undefined;
	if (
		periodicNotesPlugin &&
		typeof periodicNotesPlugin.getPeriodicNote === "function" &&
		typeof periodicNotesPlugin.createPeriodicNote === "function"
	) {
		this.periodicNotesPlugin = periodicNotesPlugin as PeriodicNotesPlugin;
	} else {
		this.periodicNotesPlugin = undefined;
	}
}
```

- [ ] **Step 4: Add candidate-to-suggestion helpers**

Add these private methods to `DateEntityProvider`.

```ts
private buildDateSuggestion(candidate: DateSuggestionCandidate): EntitySuggestionItem {
	const suggestion: EntitySuggestionItem = {
		suggestionText: candidate.suggestionText,
		noteText: candidate.noteText,
		replacementText: candidate.replacementText,
		icon: candidate.icon,
	};

	if (
		!this.settings.shouldCreateIfNotExists ||
		!this.periodicNotesPlugin ||
		!this.isPeriodicGranularityEnabled(candidate.granularity)
	) {
		return suggestion;
	}

	return {
		...suggestion,
		action: async (_item, context) => {
			return this.createOrLinkPeriodicNote(candidate, context);
		},
	};
}

private isPeriodicGranularityEnabled(granularity: PeriodicNotesGranularity): boolean {
	const activeGranularities =
		this.periodicNotesPlugin?.calendarSetManager?.getActiveGranularities();
	return activeGranularities?.includes(granularity) ?? false;
}

private async createOrLinkPeriodicNote(
	candidate: DateSuggestionCandidate,
	context: EditorSuggestContext | null
): Promise<string> {
	const periodicNotesPlugin = this.periodicNotesPlugin;
	if (!periodicNotesPlugin?.getPeriodicNote || !periodicNotesPlugin.createPeriodicNote) {
		return `[[${candidate.replacementText}]]`;
	}

	try {
		const file =
			periodicNotesPlugin.getPeriodicNote(candidate.granularity, candidate.date) ??
			await periodicNotesPlugin.createPeriodicNote(
				candidate.granularity,
				candidate.date
			);
		return this.toMarkdownLink(file, candidate.linkAlias, context);
	} catch (error) {
		console.error("Entities: failed to create periodic note", error);
		new EntitiesNotice(
			`Could not create ${candidate.granularity} note. Inserted a link instead.`,
			"alert-triangle"
		);
		return `[[${candidate.replacementText}]]`;
	}
}

private toMarkdownLink(
	file: TFile,
	alias: string,
	context: EditorSuggestContext | null
): string {
	const sourcePath = context?.file?.path ?? "";
	return this.plugin.app.fileManager.generateMarkdownLink(
		file,
		sourcePath,
		undefined,
		alias
	);
}
```

- [ ] **Step 5: Route semantic week suggestions through the helper**

Replace the current `semanticWeeks` block with this date-driven version:

```ts
const semanticWeeks = [
	{ suggestionText: "this week", date: moment() },
	{ suggestionText: "last week", date: moment().subtract(1, "week") },
	{ suggestionText: "next week", date: moment().add(1, "week") },
];

semanticWeeks.forEach(({ suggestionText, date }) => {
	const weekMoment = date.clone().startOf("isoWeek");
	const isoDate = `${weekMoment.isoWeekYear()}-W${weekMoment
		.isoWeek()
		.toString()
		.padStart(2, "0")}`;
	dates.push(
		this.buildDateSuggestion({
			suggestionText,
			noteText: isoDate,
			replacementText: isoDate,
			icon: "calendar-range",
			granularity: "week",
			date: weekMoment,
			linkAlias: suggestionText,
		})
	);
});
```

- [ ] **Step 6: Run the date provider tests**

Run:

```bash
npm test -- tests/Providers/DateEntityProvider.test.ts --runInBand
```

Expected: all date provider tests pass.

- [ ] **Step 7: Commit existing-note linking**

```bash
git add src/Providers/DateEntityProvider.ts tests/Providers/DateEntityProvider.test.ts
git commit -m "feat: link existing periodic week notes"
```

---

### Task 3: Create Missing Periodic Notes

**Files:**
- Modify: `tests/Providers/DateEntityProvider.test.ts`
- Modify: `src/Providers/DateEntityProvider.ts`

- [ ] **Step 1: Write a failing test for creating a missing weekly note**

Add this test:

```ts
test("creates a missing weekly periodic note before inserting the link", async () => {
	const weeklyFile = { path: "Periodic/Weeks/2026-W21.md" };
	const generateMarkdownLink = jest
		.fn()
		.mockReturnValue("[[Periodic/Weeks/2026-W21|next week]]");
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
		shouldCreateIfNotExists: true,
	});
	const suggestion = provider
		.getEntityList("next week")
		.find((item) => item.suggestionText === "next week");

	await expect(suggestion?.action?.(suggestion, null)).resolves.toBe(
		"[[Periodic/Weeks/2026-W21|next week]]"
	);
	expect(periodicNotes.createPeriodicNote).toHaveBeenCalledWith(
		"week",
		expect.objectContaining({})
	);
	expect(generateMarkdownLink).toHaveBeenCalledWith(
		weeklyFile,
		"",
		undefined,
		"next week"
	);
});
```

- [ ] **Step 2: Run the test and verify it fails if Task 2 did not already satisfy it**

Run:

```bash
npm test -- tests/Providers/DateEntityProvider.test.ts --runInBand
```

Expected: pass if Task 2 already implemented creation in `createOrLinkPeriodicNote`; otherwise fail because `createPeriodicNote` is not called.

- [ ] **Step 3: Ensure the implementation creates missing notes**

If the test failed, replace `createOrLinkPeriodicNote` with the Task 2 implementation shown there. The key expression must be:

```ts
const file =
	periodicNotesPlugin.getPeriodicNote(candidate.granularity, candidate.date) ??
	await periodicNotesPlugin.createPeriodicNote(
		candidate.granularity,
		candidate.date
	);
```

- [ ] **Step 4: Run the date provider tests**

Run:

```bash
npm test -- tests/Providers/DateEntityProvider.test.ts --runInBand
```

Expected: all date provider tests pass.

- [ ] **Step 5: Commit missing-note creation**

```bash
git add src/Providers/DateEntityProvider.ts tests/Providers/DateEntityProvider.test.ts
git commit -m "feat: create missing periodic week notes"
```

---

### Task 4: Add Daily Date Creation Through Periodic Notes

**Files:**
- Modify: `src/Providers/DateEntityProvider.ts`
- Modify: `tests/Providers/DateEntityProvider.test.ts`

- [ ] **Step 1: Write a failing test for creating a missing daily note**

Add this test:

```ts
test("creates a missing daily periodic note for parsed natural language dates", async () => {
	const dailyFile = { path: "Periodic/Days/2026-05-17.md" };
	const generateMarkdownLink = jest
		.fn()
		.mockReturnValue("[[Periodic/Days/2026-05-17|today]]");
	const periodicNotes = {
		calendarSetManager: {
			getActiveGranularities: jest.fn(() => ["day"]),
			getActiveConfig: jest.fn(() => ({
				enabled: true,
				openAtStartup: false,
				format: "YYYY-MM-DD",
				folder: "Periodic/Days",
			})),
			getFormat: jest.fn(() => "YYYY-MM-DD"),
		},
		getPeriodicNote: jest.fn(() => null),
		createPeriodicNote: jest.fn(async () => dailyFile),
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
		.getEntityList("today")
		.find((item) => item.suggestionText === "today");

	expect(suggestion?.action).toBeDefined();
	await expect(suggestion?.action?.(suggestion, null)).resolves.toBe(
		"[[Periodic/Days/2026-05-17|today]]"
	);
	expect(periodicNotes.createPeriodicNote).toHaveBeenCalledWith(
		"day",
		expect.objectContaining({})
	);
});
```

- [ ] **Step 2: Convert natural language date suggestions into candidates**

Replace `dateStringsToDateResults` with this version:

```ts
private dateStringsToDateResults(
	dateStrings: string[]
): EntitySuggestionItem[] {
	return dateStrings.map((dateString) => {
		const result = this.nlpPlugin?.parseDate(dateString);
		const replacementText = result?.formattedString ?? "";
		const date = result?.moment ?? moment(result?.date);
		if (result?.date && date.isValid()) {
			return this.buildDateSuggestion({
				suggestionText: dateString,
				noteText: replacementText,
				replacementText,
				icon: this.settings.icon,
				granularity: "day",
				date,
				linkAlias: dateString,
			});
		}
		return {
			suggestionText: dateString,
			noteText: replacementText,
			replacementText,
			icon: this.settings.icon,
		};
	});
}
```

Also update the direct `parseDate(query)` branch in `getEntityList`:

```ts
const result = this.nlpPlugin.parseDate(query);
if (result && result.date) {
	const parsedMoment = result.moment ?? moment(result.date);
	dates.push(
		this.buildDateSuggestion({
			suggestionText: query,
			noteText: result.formattedString,
			replacementText: result.formattedString,
			icon: this.settings.icon,
			granularity: "day",
			date: parsedMoment,
			linkAlias: query,
		})
	);
}
```

- [ ] **Step 3: Run the date provider tests**

Run:

```bash
npm test -- tests/Providers/DateEntityProvider.test.ts --runInBand
```

Expected: all date provider tests pass.

- [ ] **Step 4: Commit daily creation**

```bash
git add src/Providers/DateEntityProvider.ts tests/Providers/DateEntityProvider.test.ts
git commit -m "feat: create missing periodic daily notes"
```

---

### Task 5: Preserve Fallback Behavior And Error Handling

**Files:**
- Modify: `tests/Providers/DateEntityProvider.test.ts`
- Modify: `src/Providers/DateEntityProvider.ts`

- [ ] **Step 1: Write fallback tests**

Add these tests:

```ts
test("does not add creation action when creation setting is disabled", () => {
	const plugin = createPluginWithPlugins({
		"nldates-obsidian": createNlDatesPlugin(),
		"periodic-notes": {
			calendarSetManager: {
				getActiveGranularities: jest.fn(() => ["week"]),
			},
			getPeriodicNote: jest.fn(),
			createPeriodicNote: jest.fn(),
		},
	});

	const provider = new DateEntityProvider(plugin, {
		shouldCreateIfNotExists: false,
	});
	const suggestion = provider
		.getEntityList("this week")
		.find((item) => item.suggestionText === "this week");

	expect(suggestion?.action).toBeUndefined();
	expect(suggestion?.replacementText).toMatch(/^\d{4}-W\d{2}$/);
});

test("does not add creation action when Periodic Notes has not enabled the granularity", () => {
	const plugin = createPluginWithPlugins({
		"nldates-obsidian": createNlDatesPlugin(),
		"periodic-notes": {
			calendarSetManager: {
				getActiveGranularities: jest.fn(() => ["day"]),
			},
			getPeriodicNote: jest.fn(),
			createPeriodicNote: jest.fn(),
		},
	});

	const provider = new DateEntityProvider(plugin, {
		shouldCreateIfNotExists: true,
	});
	const suggestion = provider
		.getEntityList("this week")
		.find((item) => item.suggestionText === "this week");

	expect(suggestion?.action).toBeUndefined();
	expect(suggestion?.replacementText).toMatch(/^\d{4}-W\d{2}$/);
});

test("falls back to a wiki link when Periodic Notes creation fails", async () => {
	const plugin = createPluginWithPlugins({
		"nldates-obsidian": createNlDatesPlugin(),
		"periodic-notes": {
			calendarSetManager: {
				getActiveGranularities: jest.fn(() => ["week"]),
			},
			getPeriodicNote: jest.fn(() => null),
			createPeriodicNote: jest.fn(async () => {
				throw new Error("creation failed");
			}),
		},
	});

	const provider = new DateEntityProvider(plugin, {
		shouldCreateIfNotExists: true,
	});
	const suggestion = provider
		.getEntityList("this week")
		.find((item) => item.suggestionText === "this week");

	await expect(suggestion?.action?.(suggestion, null)).resolves.toMatch(
		/^\[\[\d{4}-W\d{2}\]\]$/
	);
});
```

- [ ] **Step 2: Ensure fallback behavior is implemented**

Confirm these conditions exist in `buildDateSuggestion`:

```ts
if (
	!this.settings.shouldCreateIfNotExists ||
	!this.periodicNotesPlugin ||
	!this.isPeriodicGranularityEnabled(candidate.granularity)
) {
	return suggestion;
}
```

Confirm `createOrLinkPeriodicNote` catches creation errors:

```ts
} catch (error) {
	console.error("Entities: failed to create periodic note", error);
	new EntitiesNotice(
		`Could not create ${candidate.granularity} note. Inserted a link instead.`,
		"alert-triangle"
	);
	return `[[${candidate.replacementText}]]`;
}
```

- [ ] **Step 3: Run the date provider tests**

Run:

```bash
npm test -- tests/Providers/DateEntityProvider.test.ts --runInBand
```

Expected: all date provider tests pass.

- [ ] **Step 4: Commit fallback coverage**

```bash
git add src/Providers/DateEntityProvider.ts tests/Providers/DateEntityProvider.test.ts
git commit -m "test: cover periodic date creation fallbacks"
```

---

### Task 6: Final Verification

**Files:**
- Verify all changed files

- [ ] **Step 1: Run lint**

Run:

```bash
npm run lint
```

Expected: lint exits with code 0.

- [ ] **Step 2: Run tests**

Run:

```bash
npm test
```

Expected: all test suites pass.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: TypeScript and production esbuild complete without errors.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat master
git diff master -- src/entities.types.ts src/Providers/DateEntityProvider.ts tests/Providers/DateEntityProvider.test.ts
```

Expected: only the Periodic Notes types, date provider logic, and focused tests changed.

- [ ] **Step 5: Commit final cleanup if needed**

If lint or build required small fixes, commit them:

```bash
git add src/entities.types.ts src/Providers/DateEntityProvider.ts tests/Providers/DateEntityProvider.test.ts
git commit -m "chore: finalize periodic date creation"
```

---

## Self-Review

- Spec coverage: The plan covers optional Periodic Notes detection, using Periodic Notes for template-aware creation, daily and weekly note creation, existing-note linking, fallback behavior, and verification.
- Placeholder scan: No placeholder implementation steps remain; code snippets include concrete names and signatures.
- Type consistency: `PeriodicNotesGranularity`, `PeriodicNotesPlugin`, and `DateSuggestionCandidate` are introduced before use, and all later tasks use the same names.
