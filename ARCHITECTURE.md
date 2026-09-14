# Architecture Overview

This document explains the overall layout and flow of the **Entities** Obsidian plugin.

## Directory Structure

```
.
├── src/                # TypeScript source
│   ├── Providers/      # Autocomplete providers
│   │   ├── EntityProvider.ts      # Abstract base class
│   │   ├── ProviderRegistry.ts    # Singleton registry
│   │   ├── EntityFilters.ts       # Shared filter logic
│   │   ├── FolderEntityProvider.ts
│   │   ├── DataviewEntityProvider.ts
│   │   ├── TemplateProvider.ts
│   │   ├── DateEntityProvider.ts
│   │   ├── MetadataMenuProvider.ts
│   │   ├── HelperActionsProvider.ts
│   │   └── CharacterProvider.ts
│   ├── ui/             # Reusable UI helpers
│   │   ├── suggest.ts                   # Owned input popup (retained Periodic Notes navigation)
│   │   ├── file-suggest.ts              # File/folder suggesters
│   │   ├── FrontmatterKeySuggest.ts     # Frontmatter key autocomplete
│   │   └── providerSettingsComponents.ts # Shared settings UI builders
│   ├── EntitiesSuggestor.ts   # EditorSuggest implementation
│   ├── EntitiesSettings.ts    # Settings tab & modal
│   ├── suggestion.types.ts    # Required target union and suggestion presentation
│   ├── suggestionTargets.ts    # Target validation, identity and effective aliases
│   ├── entities.types.ts      # Shared types & interfaces
│   ├── actionCoordinator.ts   # Typed outcomes and one guarded editor commit
│   ├── editorBindings.ts      # Public editor extension and lifecycle observations
│   ├── helperEdits.ts         # Pure affected-line transformations
│   ├── userComponents.ts      # Notices, modals, icon picker
│   └── main.ts                # Plugin entry point
├── tests/              # Jest unit & integration tests
├── docs/               # Developer documentation & templates
├── styles.css          # Plugin styles
├── manifest.json       # Obsidian plugin manifest
├── esbuild.config.mjs  # Build configuration
└── package.json
```

## Plugin Flow

1. **`main.ts`** – On load, the plugin:
   - Reads saved settings.
   - Initializes the singleton `ProviderRegistry`.
   - Registers all provider classes.
   - Instantiates provider instances from saved settings.
   - Registers a narrow public editor binding extension before creating and registering `EntitiesSuggestor`.
   - Registers data/index listeners once through Obsidian lifecycle cleanup.
   - On unload, drains pending saves, disposes suggestions, and resets providers.

2. **`EntitiesSuggestor`** – Implements `EditorSuggest`:
   - `onTrigger` chooses the newest `@`, `:`, or `/` at line start or after
     whitespace before validating it. `@` spans spaces; `:` and `/` stop at
     whitespace, and a second slash invalidates a slash query. There is no
     fallback to an earlier starter. `triggerContext.ts` checks the full
     mark-to-cursor span in the supplied editor's current native syntax tree.
     Missing/stale/incomplete public binding or syntax state quietly retries on
     a later normal request; providers remain synchronous.
   - `getSuggestions` queries providers matching the trigger, applies caching
     based on each provider's `RefreshBehavior`, runs Obsidian's built-in fuzzy
     search, and deduplicates results.
   - Template creation suggestions are only requested from providers that
     support the `@` trigger and have templates configured.
   - `selectSuggestion` validates real file identity and generates its native link
     using the retrieval source note, or inserts deliberate unresolved links,
     exact literal text, or a typed action outcome through the same guarded transaction.

3. **`EntitiesSettings`** – Settings tab where users add, configure, and remove
   provider instances. Provider classes supply their own settings UI via static
   `buildSummarySetting` / `buildSimpleSettings` / `buildAdvancedSettings`
   methods.

   `SettingsStore` owns the canonical configuration. UI builders receive detached
   drafts; edits and deletions address `providerInstanceId` and update memory
   immediately. Disk writes start in the next microtask, run one at a time, and
   coalesce edits arriving during a write into the latest successor snapshot.
   Provider reconstruction uses the current in-memory settings, independent of
   disk completion. See [settings recovery](docs/settings-recovery.md) for the
   migration, backup, retry, and shutdown contract.

4. **Providers** – Each provider:
   - Extends `EntityProvider<T>` with strongly-typed settings.
   - Implements `getEntityList(query, trigger)` synchronously.
   - Declares supported triggers via the `triggers` getter and query dependence
     via `isQueryDependent` (safe default: `true`).
   - Optionally overrides `getRefreshBehavior()` and
     `getTemplateCreationSuggestions(query)`.
   - Disabled providers (where `enabled === false`) are automatically excluded.

## Shared Modules

### EntityFilters (`src/Providers/EntityFilters.ts`)

Folder and Dataview select real `TFile` candidates before applying shared filters
and expanding aliases. `fileSources.ts` follows actual folder children or filters
the resolved Dataview files, retaining counts before alias expansion. Dataview
converts the synchronous `pages(source)` iterable with `Array.from` once per
source evaluation and ignores malformed/unresolved page neighbors.

- `classifyFilter()` distinguishes inactive blank rows, active case-insensitive
  regexes and invalid rows. `compileFilters()` retains a configuration error
  instead of dropping an invalid constraint.
- `applyCompiledFiltersToFiles()` uses AND across rows, ANY supported scalar list
  member for include and NONE for exclude. It reads exact own frontmatter keys;
  missing/null/unsupported values are absent, while false/zero/empty strings are
  real values. Invalid configurations return no ordinary files.
- `fileAliases.ts` uses public `parseFrontMatterAliases` and
  `parseFrontMatterStringArray` against the real file's cached frontmatter.
  Native aliases and one optional exact custom key are independent. Selector
  defaults stay undefined for R1 compatibility; unsupported legacy selectors
  suppress only custom aliases. R3 owns target/alias deduplication and linking.
- `ui/fileProviderSettings.ts` shares the runtime classifier with the filter
  editor and keeps whole-array R1 draft conflicts. Exact invalid source/path/regex
  edits remain canonical; validation never claims a successful disk save.
  Source diagnostics are synchronous with no polling or delayed count updates.

Ordinary-source/filter errors do not disable a provider or change its independent
creation recipes. See [file provider semantics](docs/file-providers.md).

### Provider Settings Components (`src/ui/providerSettingsComponents.ts`)

Shared UI builders eliminating duplication across provider settings:

- `buildIconPickerSetting()` – Icon selection button with picker modal.
- `buildTemplateCreationSetting()` – Template configuration button with status
  label.
- `buildFolderPathSummarySetting()` – Folder path input with existence indicator
  and optional note count.
- `entityTemplateStatusLabel()` – Human-readable template status string.

### Settings input lifecycle

`ui/inputSuggestLifecycle.ts` owns bounded cleanup for the plugin, each rendered
settings view/modal, and nested filter editors. Disposing a view closes its owned
popups and releases input/window listeners and retained save callbacks. Catalogs
refresh on focus and filter synchronously while typing. The existing navigation
and Popper positioning remain after verified native `AbstractInputSuggest.close`
listener-retention defects; see [input suggestions](docs/input-suggestions.md).

### Creation boundaries

`entityCreation.ts` confirms actual live file outcomes without owning an editor
or modal. Provider callbacks capture destinations/source paths and return confirmed
results to `actionCoordinator.ts`. `creationPrompt.ts` tracks pending name
prompts once per plugin and checks provider/lifecycle state before engine startup.
See [confirmed creation](docs/creation-recovery.md) for destination policies,
recipe preservation, native-method evidence and the temporary Template insertion limitation.

## Major Interfaces

- **`EntityProvider<T>`** (abstract base class)
  - Holds provider settings and plugin reference.
  - Defines `getEntityList(query, trigger)` (sync) and optional template creation.
  - Exposes `triggers` getter, `isEnabled` getter, and `getRefreshBehavior()`.
  - Requires `ProviderSettingsInput<T>` at construction and exposes the typed
    read-only `providerInstanceId`. `providerTypeID` identifies the implementation;
    `providerInstanceId` identifies one saved configuration across reconstruction.
    Default factories return fresh nested data without generating IDs.

- **`ProviderRegistry`** (singleton)
  - Manages registered provider classes and instantiated providers.
  - `getProvidersForTrigger(trigger)` returns enabled providers matching a trigger.
  - `instantiateProvidersFromSettings()` constructs rows independently and atomically
    replaces the runtime snapshot. Unknown/failed rows stay preserved in settings.
  - Every replacement/reset increments `revision` and notifies `onChange` subscribers.
    The suggestor immediately closes obsolete menus and clears dismissal state.

- **`EntitiesSuggestor`** (extends `EditorSuggest`)
  - Caches raw items by persisted provider instance ID and trigger, with one current
    query entry per pair. Each request filters fresh clones and records private
    provider/revision/result provenance for selection.
  - Deduplicates after fuzzy matching by file/effective alias, unresolved
    linkpath/effective alias, exact text, or provider-scoped action ID. Keeps the
    best score and deterministic provider-order ties, with the winner's provenance.
  - Shows vault-relative paths on every file row, preserving explanatory notes.
  - Calls `fileManager.generateMarkdownLink` only at selection, after verifying
    `vault.getAbstractFileByPath(file.path) === file`. Uses that row's captured
    source context and native output unchanged; failures give feedback with no write.
  - Consumes the displayed epoch synchronously, then lets the coordinator retain
    provider/lifetime validity independently of fresh retrieval and cache changes.
    ActionContext copies the source path, document, exact span and selections; it
    exposes only `canStartWork()` for later engine startup checks.
  - Commits one `Editor.transaction` with `input.complete` origin and a caret in
    the resulting document after final binding, revision, source, selection and
    range checks. Created files remain created if later insertion is refused.

- **`RegisterableEntityProvider`** – Type describing provider classes that can be
  registered. Requires static `providerTypeID`, `getDescription()`,
  `getDefaultSettings()`, `buildSummarySetting()`, and optionally
  `buildSimpleSettings()` / `buildAdvancedSettings()`.

## Trigger System

| Character | Scope | Behavior |
|-----------|-------|----------|
| `@` | Phrase | Spans spaces (`@John Doe`), takes priority over `:` and `/` |
| `:` | Token | Stops at whitespace, for symbols/emoji |
| `/` | Token | Stops at whitespace, for commands/actions |

Providers declare their trigger(s) via the `triggers` getter. The suggestor
queries the registry for providers matching the detected trigger.

## Refresh Behavior

Providers control caching via `getRefreshBehavior()`:

| Behavior | Description |
|----------|-------------|
| `Default` | Refreshes when >200ms since last fetch, or when invalidated |
| `ShouldRefresh` | Evaluates on every request |
| `Never` | Skips age expiry; respects query, trigger, identity and explicit invalidation |

`isQueryDependent` defaults to `true`. Character and Date depend on the typed
query. Folder, Dataview, Template, Helper and Metadata Menu ordinary lists are
query-independent (Metadata Menu's ordinary list is empty). Creation suggestions
are always requested separately and remain uncached. Failed retrieval removes the
old entry and retries on the next request, including under `Never`.

Vault create/rename/delete, metadata changed/deleted/resolved, layout readiness,
and the verified Dataview/Metadata Menu metadata events invalidate data. This
marks caches dirty while keeping displayed results selectable, without closing
the popover or advancing its result epoch. The next request refreshes data and
replaces the result epoch. Configuration replacement closes the popover
immediately and permits the same span to reopen. The
200ms fallback remains because integration settings/index lifecycles are not all
observable. There are no runtime provider timers or background queries.

Selection checks private provenance before action execution or default link
insertion. Menu close alone does not invalidate valid selection or its captured
context. After awaiting an action, a second provider-generation/unload check
prevents a returned string from inserting after replacement. This does **not**
cancel action side effects or provide document/editor/range safety; those remain
R4. See [provider runtime contract](docs/provider-runtime.md) for authoring details.

## External Plugin Dependencies

Several providers integrate with optional external plugins:

- **Dataview** – `DataviewEntityProvider` synchronously resolves the current API
  on each evaluation; the separate settings UI retry helper is unchanged.
- **Natural Language Dates** – `DateEntityProvider` uses `nldates-obsidian`.
- **Templater** – Template creation in `EntityProvider` base and `TemplateEntityProvider`.
- **Metadata Menu** – `MetadataMenuProvider` reads file class definitions.

Dataview, Metadata Menu and Date re-resolve their current plugin/API/index
capabilities during evaluation, recovering from absent, removed or replaced
integrations. Template scans its existing shallow folder selection during
evaluation, so file events refresh its list. Missing capabilities return empty
results. The registry and suggestor isolate constructor, eligibility, cache-policy,
ordinary retrieval and creation retrieval failures per provider. Malformed items
are skipped individually and diagnostics are bounded per provider/stage.

## Testing

- Tests under `tests/` use Jest with `ts-jest` and `jsdom` environment.
- Obsidian APIs are mocked inline per test file.
- Coverage includes: trigger detection, provider filtering, refresh behavior,
  suggestion selection, entity filters, and provider-specific logic.
- Run with `npm test`; build with `npm run build` (includes type checking).

## TypeScript Configuration

- Full `strict` mode enabled (includes `strictNullChecks`,
  `strictPropertyInitialization`, `strictFunctionTypes`, etc.).
- `noFallthroughCasesInSwitch` enabled.
- Target: ES6, Module: ESNext.

## Adding a New Provider

1. Create a new file in `src/Providers/` extending `EntityProvider<T>`.
2. Define settings interface extending `EntityProviderUserSettings`.
3. Implement required static methods: `providerTypeID`, `getDescription()`,
   `getDefaultSettings()`, `buildSummarySetting()`.
4. Implement `getEntityList(query, trigger)` returning `EntitySuggestionItem[]`.
5. Use shared UI components from `src/ui/providerSettingsComponents.ts` for
   common settings (icon picker, folder path, template creation).
6. Use `EntityFilters` for frontmatter-based filtering if needed.
7. Register the class in `main.ts` → `registerEntityProviders()`.
8. Add tests in `tests/Providers/`.

## Editor ownership and observed limits

`editorBindings.ts` installs one `ViewPlugin` through `registerEditorExtension`.
It reads optional public `editorInfoField` and retains the exact Editor, info,
TFile, EditorView and owner document/window. Missing fields, replacement, destroy,
detachment observed by layout checks and popout closure fail safely. Focus changes
to another mapped editor invalidate pending work; selection seeds the focus
baseline so modal blur and return to the same editor remain valid.

Immediate public `editor-change` revisions detect delivered edit→undo even when
text is restored. Delivered activation events are tracked separately from lookup
cache revisions. Native activation is debounced: undelivered same-task programmatic
A→B→A is not detectable. Final active binding/document/selection checks still apply.
No private editor fields, setter interception, arbitrary timer or syntax classifier
is used. CodeMirror state/view remain host-external imports; direct development
declarations pin the already-resolved versions. Required public APIs exist in
Obsidian 1.7.2 declarations, which does not establish live floor/popout acceptance.

Helpers calculate one whole-line edit without touching an editor, preserving
indentation, text outside the trigger and existing created metadata. Templater
insertion is always unavailable through Entities; preserved rows/settings explain
the manual native command. No append, parser, command dispatch or alternate
creation is attempted. Live Source/Live Preview, popout, undo/redo and mobile
acceptance remain NOT RUN; see the runtime acceptance matrix.

Trigger dismissal uses a constructor-created public child `Scope` so explicit
non-composing Escape is captured before native close clears context. The parent
retains native navigation and selection handlers. An exact editor/file/binding
session survives continued typing and data invalidation; the existing binding
view extension invalidates it on starter replacement, ineligible candidates,
selection departure and lifecycle changes. No second observer or popup scheduler
is registered. Ordinary close never creates a dismissal or invalidates selection
provenance, preserving close-before-selection and cancelled creation retries.

Native code/link marker names and the narrow unfinished Markdown destination
exception live only in `triggerContext.ts`. Compound names are compared by exact
parts; open wiki syntax requires a native formatting opener at actual `[[` text
and its contiguous bare-link run. Unfinished destinations require a native
non-bare link-label `]` followed by an unclassified `(` and same-line tail;
classified tokens end that tail. Generic link labels, strings and unknown token
names are not blanket exclusions. CodeMirror language/state/view and Lezer stay
host-external. The replay fixtures model native emitted boundaries, not full
live parser scheduling or supported-runtime acceptance; see the
[runtime matrix](docs/recovery/runtime-acceptance.md).
