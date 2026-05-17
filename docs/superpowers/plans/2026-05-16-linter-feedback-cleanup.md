# Linter Feedback Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the ESLint/Obsidian plugin feedback from advisory warnings to a clean, enforceable lint baseline without weakening useful rules.

**Architecture:** Treat the warnings as four classes of work: mechanical hygiene, Obsidian platform compatibility, themeable UI status styling, and user-facing copy. Land them in small commits, then ratchet lint from "warnings allowed" to "warnings fail CI" once the baseline is clean.

**Tech Stack:** ESLint v9 flat config, `eslint-plugin-obsidianmd`, TypeScript, Obsidian Settings API, Jest.

---

## Linter Baseline

Command run:

```bash
npm run lint -- --format json --output-file /tmp/obsidian-entities-eslint.json
```

Result: `112` warnings, `0` errors.

Grouped by rule:

| Rule | Count | Fixable | Files | Engineering bucket |
| --- | ---: | ---: | ---: | --- |
| `obsidianmd/ui/sentence-case` | 67 | 0 | 10 | User-facing copy |
| `obsidianmd/no-static-styles-assignment` | 17 | 0 | 5 | Themeable status styling |
| unused eslint-disable comments | 15 | 15 | 7 | Mechanical hygiene |
| `obsidianmd/prefer-window-timers` | 6 | 6 | 4 | Obsidian popout compatibility |
| `@typescript-eslint/no-unused-vars` | 3 | 0 | 3 | Mechanical hygiene |
| `obsidianmd/settings-tab/no-problematic-settings-headings` | 2 | 1 | 1 | Settings IA/copy |
| `no-empty` | 1 | 0 | 1 | Mechanical hygiene |
| `obsidianmd/prefer-abstract-input-suggest` | 1 | 0 | 1 | Component architecture |

## Execution Strategy

Use subagent-driven development with these slices:

1. Mechanical cleanup worker: unused disables, unused variables, empty block, window timers.
2. Status styling worker: replace direct `style.color` assignments with semantic CSS classes and a tiny helper.
3. Settings/copy worker: sentence-case and settings headings across providers.
4. Suggest component worker: evaluate migration from custom `TextInputSuggest` to Obsidian `AbstractInputSuggest`.
5. Enforcement worker: promote cleaned rules to errors and make warnings fail CI.

Run workers sequentially. Do not run these workers in parallel because the settings/copy and styling workers both touch provider settings files.

---

### Task 1: Mechanical Hygiene And Window Timers

**Files:**
- Modify: `scripts/createFontAwesomeIconsDictionary.ts`
- Modify: `src/EntitiesSettings.ts`
- Modify: `src/Providers/CharacterProvider.ts`
- Modify: `src/Providers/DataviewEntityProvider.ts`
- Modify: `src/Providers/DateEntityProvider.ts`
- Modify: `src/Providers/EntityProvider.ts`
- Modify: `src/Providers/MetadataMenuProvider.ts`
- Modify: `src/entities.types.ts`
- Modify: `src/ui/suggest.ts`
- Modify: `tests/EntitiesSuggestor.test.ts`
- Modify: `tests/Providers/CharacterProvider.test.ts`
- Modify: `tests/Providers/ProviderRegistry.test.ts`

- [ ] **Step 1: Remove unused disable comments automatically**

Run:

```bash
npm run lint:fix
```

Expected: removes unused `eslint-disable` comments and applies safe timer/settings-heading fixes where ESLint can autofix them.

- [ ] **Step 2: Replace bare timers with `window` timers**

Confirm these specific warnings are gone or fix manually:

```ts
window.clearTimeout(saveTimeout);
saveTimeout = window.setTimeout(() => {
	// existing callback body
}, delay);
```

Use `ReturnType<typeof window.setTimeout>` for timer handles in browser/runtime code:

```ts
let saveTimeout: ReturnType<typeof window.setTimeout> | undefined;
```

- [ ] **Step 3: Remove unused variables**

Apply these intent-preserving edits:

```ts
// src/Providers/DataviewEntityProvider.ts
} catch {
	return "error";
}
```

```ts
// src/Providers/DateEntityProvider.ts
const weekStartDateShort = weekMoment.format("M/D");
```

Remove the unused `weekStartDate` variable if it is not used anywhere else.

```ts
// tests/Providers/CharacterProvider.test.ts
// Remove `hasSynonymIndicator` if the assertion no longer uses it.
```

- [ ] **Step 4: Replace the empty block**

In `src/Providers/DateEntityProvider.ts`, replace the empty `if` body with a clear early return or remove the block if it is dead.

Preferred if the provider can function without NLDates:

```ts
if (!this.nlpPlugin || this.nlpPlugin.parseDate === undefined) {
	return;
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run lint -- --format json --output-file /tmp/entities-lint-task1.json
node -e 'const data=require("/tmp/entities-lint-task1.json"); const rows=data.flatMap(f=>f.messages.map(m=>m.ruleId||"eslint/unused-disable")); for (const rule of ["eslint/unused-disable","obsidianmd/prefer-window-timers","@typescript-eslint/no-unused-vars","no-empty"]) { const n=rows.filter(r=>r===rule).length; console.log(rule,n); if (n) process.exitCode=1; }'
npm test -- --runInBand
```

Expected: the four mechanical rule groups print `0`; tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add scripts/createFontAwesomeIconsDictionary.ts src tests
git commit -m "fix: clear mechanical lint warnings"
```

---

### Task 2: Themeable Status Styling

**Files:**
- Create: `src/ui/validationStatus.ts`
- Modify: `styles.css`
- Modify: `src/Providers/DataviewEntityProvider.ts`
- Modify: `src/Providers/DateEntityProvider.ts`
- Modify: `src/Providers/FolderEntityProvider.ts`
- Modify: `src/Providers/MetadataMenuProvider.ts`
- Modify: `src/ui/providerSettingsComponents.ts`

- [ ] **Step 1: Add status helper**

Create `src/ui/validationStatus.ts`:

```ts
import { ExtraButtonComponent } from "obsidian";

export type ValidationStatus = "neutral" | "success" | "warning" | "error";

const STATUS_CLASSES = [
	"entities-validation-status-success",
	"entities-validation-status-warning",
	"entities-validation-status-error",
];

export function setValidationStatus(
	button: ExtraButtonComponent,
	icon: string,
	tooltip: string,
	status: ValidationStatus
): void {
	button.setIcon(icon);
	button.setTooltip(tooltip);

	for (const className of STATUS_CLASSES) {
		button.extraSettingsEl.removeClass(className);
	}

	if (status !== "neutral") {
		button.extraSettingsEl.addClass(`entities-validation-status-${status}`);
	}
}
```

- [ ] **Step 2: Add CSS classes**

Add to `styles.css`:

```css
.entities-validation-status-success {
	color: var(--text-success);
}

.entities-validation-status-warning {
	color: var(--text-warning);
}

.entities-validation-status-error {
	color: var(--text-error);
}
```

- [ ] **Step 3: Replace direct status color writes**

Replace patterns like:

```ts
queryOKIcon.setIcon("search-x");
queryOKIcon.setTooltip("Dataview Source Valid but Empty");
queryOKIcon.extraSettingsEl.style.color = "var(--text-warning)";
```

with:

```ts
setValidationStatus(
	queryOKIcon,
	"search-x",
	"Dataview source valid but empty",
	"warning"
);
```

Use statuses consistently:

| Existing state | New status |
| --- | --- |
| `style.color = ""` | `"neutral"` |
| `var(--text-success)` | `"success"` |
| `var(--text-warning)` | `"warning"` |
| `var(--text-error)` | `"error"` |

- [ ] **Step 4: Verify static-style warnings are gone**

Run:

```bash
npm run lint -- --format json --output-file /tmp/entities-lint-task2.json
node -e 'const data=require("/tmp/entities-lint-task2.json"); const n=data.flatMap(f=>f.messages).filter(m=>m.ruleId==="obsidianmd/no-static-styles-assignment").length; console.log(n); process.exit(n ? 1 : 0);'
npm test -- --runInBand
```

Expected: `0`; tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/ui/validationStatus.ts styles.css src/Providers src/ui/providerSettingsComponents.ts
git commit -m "fix: use themeable validation status classes"
```

---

### Task 3: User-Facing Copy And Settings Headings

**Files:**
- Modify: `src/EntitiesSettings.ts`
- Modify: `src/Providers/CharacterProvider.ts`
- Modify: `src/Providers/DataviewEntityProvider.ts`
- Modify: `src/Providers/DateEntityProvider.ts`
- Modify: `src/Providers/FolderEntityProvider.ts`
- Modify: `src/Providers/HelperActionsProvider.ts`
- Modify: `src/Providers/MetadataMenuProvider.ts`
- Modify: `src/Providers/TemplateProvider.ts`
- Modify: `src/ui/providerSettingsComponents.ts`
- Modify: `src/userComponents.ts`

- [ ] **Step 1: Generate the current copy todo list**

Run:

```bash
npm run lint -- --format json --output-file /tmp/entities-lint-copy.json
node -e 'const data=require("/tmp/entities-lint-copy.json"); for (const f of data) for (const m of f.messages) if (m.ruleId==="obsidianmd/ui/sentence-case" || m.ruleId==="obsidianmd/settings-tab/no-problematic-settings-headings") console.log(`${f.filePath.replace(process.cwd()+"/","")}:${m.line}:${m.column} ${m.message}`);'
```

Expected: only copy/settings-heading findings are printed.

- [ ] **Step 2: Apply sentence case deliberately**

Use the linter's expected text unless the current capitalization is a brand, acronym, or plugin name. Known acceptable examples:

```ts
.setName("Entity providers")
.setDesc("Settings for each active entity provider")
.setName("Add new provider")
.setDesc("Open new provider settings")
.setTooltip("Debugging only")
.setPlaceholder("Dataview source")
.setName("Create entities for aliases")
.setName("Property value/regex")
```

Keep plugin names/acronyms readable when the linter suggestion would degrade meaning:

```ts
// OK if lint accepts it or if explicitly suppressed with a reason:
"NLDates plugin OK"
"Dataview plugin not found"
```

If a suppression is needed, use a one-line rule-specific comment:

```ts
// eslint-disable-next-line obsidianmd/ui/sentence-case -- "NLDates" is the plugin brand name.
```

- [ ] **Step 3: Rename the settings heading**

Replace the current plugin-name/settings heading with a concise section heading:

```ts
new Setting(containerEl)
	.setName("General")
	.setDesc("Configure provider refresh and advanced behavior")
	.setHeading();
```

- [ ] **Step 4: Verify copy findings are gone**

Run:

```bash
npm run lint -- --format json --output-file /tmp/entities-lint-task3.json
node -e 'const data=require("/tmp/entities-lint-task3.json"); const rules=new Set(["obsidianmd/ui/sentence-case","obsidianmd/settings-tab/no-problematic-settings-headings"]); const rows=data.flatMap(f=>f.messages.filter(m=>rules.has(m.ruleId))); for (const r of rows) console.log(r.ruleId,r.message); process.exit(rows.length ? 1 : 0);'
npm test -- --runInBand
```

Expected: no copy/settings-heading findings; tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/EntitiesSettings.ts src/Providers src/ui/providerSettingsComponents.ts src/userComponents.ts
git commit -m "fix: align settings copy with obsidian guidelines"
```

---

### Task 4: Replace Or Justify Custom TextInputSuggest

**Files:**
- Modify: `src/ui/suggest.ts`
- Modify: callers of `TextInputSuggest` if needed
- Test: closest affected provider/settings tests

- [ ] **Step 1: Inspect usage**

Run:

```bash
rg -n "TextInputSuggest|AbstractInputSuggest|new .*Suggest" src tests
```

Expected: all custom suggest usage is known before changing the abstraction.

- [ ] **Step 2: Prefer Obsidian's built-in API if behavior matches**

Refactor the custom class to extend `AbstractInputSuggest<T>` if the existing behavior can be preserved. The target shape should be:

```ts
import { AbstractInputSuggest, App } from "obsidian";

export abstract class TextInputSuggest<T> extends AbstractInputSuggest<T> {
	constructor(app: App, inputEl: HTMLInputElement | HTMLTextAreaElement) {
		super(app, inputEl);
	}
}
```

Then move existing rendering/filtering behavior into the methods required by `AbstractInputSuggest`.

- [ ] **Step 3: If migration is too risky, document the exception**

If the custom implementation is required for keyboard scope, Popper positioning, or non-standard input behavior, keep it and add a narrowly scoped suppression:

```ts
// eslint-disable-next-line obsidianmd/prefer-abstract-input-suggest -- This custom suggest keeps Popper positioning and keyboard scope behavior not provided by AbstractInputSuggest.
```

This is acceptable only if Step 1 confirms migration changes behavior outside the lint cleanup scope.

- [ ] **Step 4: Verify**

Run:

```bash
npm run lint -- --format json --output-file /tmp/entities-lint-task4.json
node -e 'const data=require("/tmp/entities-lint-task4.json"); const rows=data.flatMap(f=>f.messages.filter(m=>m.ruleId==="obsidianmd/prefer-abstract-input-suggest")); console.log(rows.length); process.exit(rows.length ? 1 : 0);'
npm test -- --runInBand
```

Expected: `0`; tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/ui/suggest.ts src tests
git commit -m "fix: resolve input suggest lint guidance"
```

---

### Task 5: Ratchet Lint Enforcement

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Promote resolved advisory rules**

Once Tasks 1-4 produce zero findings, change the temporary advisory rules in `eslint.config.mjs` from warnings to errors:

```js
const obsidianAdvisoryRules = {
	"obsidianmd/no-static-styles-assignment": "error",
	"obsidianmd/prefer-abstract-input-suggest": "error",
	"obsidianmd/prefer-active-doc": "warn",
	"obsidianmd/prefer-window-timers": "error",
	"obsidianmd/settings-tab/no-manual-html-headings": "error",
	"obsidianmd/settings-tab/no-problematic-settings-headings": "error",
	"obsidianmd/ui/sentence-case": "error",
};
```

Keep `prefer-active-doc` as `warn` only if no current findings exist and the rule is advisory for this codebase.

- [ ] **Step 2: Fail CI on warnings**

Update `package.json`:

```json
{
	"lint": "eslint . --max-warnings=0",
	"lint:fix": "eslint . --fix"
}
```

The CI workflow can continue running:

```yaml
- name: Lint
  run: npm run lint
```

- [ ] **Step 3: Final verification**

Run:

```bash
npm run lint
npm test -- --runInBand
npm run build
npm run check
```

Expected: all commands pass, and `npm run lint` reports no warnings.

- [ ] **Step 4: Commit**

Run:

```bash
git add eslint.config.mjs package.json .github/workflows/ci.yml
git commit -m "chore: enforce clean lint baseline"
```

---

## Review Checklist

- [ ] No broad rule disables were added.
- [ ] Any remaining inline disable has a specific rule name and a concrete reason.
- [ ] No user-facing copy was changed from a proper brand/plugin name to an awkward generic phrase.
- [ ] Status icons use semantic classes and Obsidian theme variables.
- [ ] `npm run lint` fails on future warnings after Task 5.
- [ ] `npm run check` passes at the end.
- [ ] Generated files (`main.js`, `dist/`) are not tracked.

## Residual Risk

The only potentially architectural task is replacing the custom `TextInputSuggest`. Do it after mechanical/style/copy cleanup so a behavior regression is isolated to one commit and can be reverted independently if needed.
