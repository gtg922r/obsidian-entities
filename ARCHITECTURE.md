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
│   │   ├── suggest.ts                   # Base text input suggest (from obsidian-periodic-notes)
│   │   ├── file-suggest.ts              # File/folder suggesters
│   │   ├── FrontmatterKeySuggest.ts     # Frontmatter key autocomplete
│   │   └── providerSettingsComponents.ts # Shared settings UI builders
│   ├── EntitiesSuggestor.ts   # EditorSuggest implementation
│   ├── EntitiesSettings.ts    # Settings tab & modal
│   ├── suggestion.types.ts    # Required target union and suggestion presentation
│   ├── suggestionTargets.ts    # Target validation, identity and effective aliases
│   ├── entities.types.ts      # Shared types & interfaces
│   ├── entitiesUtilities.ts   # Templater integration helpers
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
   - Creates an `EntitiesSuggestor` and registers it with Obsidian.
   - Registers data/index listeners once through Obsidian lifecycle cleanup.
   - On unload, drains pending saves, disposes suggestions, and resets providers.

2. **`EntitiesSuggestor`** – Implements `EditorSuggest`:
   - `onTrigger` detects trigger characters (`@`, `:`, `/`). `@` is phrase-scoped
     (spans spaces), while `:` and `/` are token-scoped (stop at whitespace).
     `@` takes priority when multiple triggers are present.
   - `getSuggestions` queries providers matching the trigger, applies caching
     based on each provider's `RefreshBehavior`, runs Obsidian's built-in fuzzy
     search, and deduplicates results.
   - Template creation suggestions are only requested from providers that
     support the `@` trigger and have templates configured.
   - `selectSuggestion` validates real file identity and generates its native link
     using the retrieval source note, or inserts deliberate unresolved links,
     exact literal text, or the existing action callback result.

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

Extracts the duplicated filter compilation and application logic used by both
`FolderEntityProvider` and `DataviewEntityProvider`:

- `compileFilters(filters)` – Compiles `EntityFilter[]` into regex-ready
  `CompiledFilter[]`, discarding invalid patterns.
- `applyFiltersToFiles(files, filters, app)` – Filters `TFile[]` by frontmatter
  properties using the metadata cache.
- `applyFiltersToQueryResults(results, filters, app)` – Generic version for
  Dataview query results (any `{ file: { path } }[]`).

All filters use AND logic. Include filters require a property match; exclude
filters pass entities that lack the property.

### Provider Settings Components (`src/ui/providerSettingsComponents.ts`)

Shared UI builders eliminating duplication across provider settings:

- `buildIconPickerSetting()` – Icon selection button with picker modal.
- `buildTemplateCreationSetting()` – Template configuration button with status
  label.
- `buildFolderPathSummarySetting()` – Folder path input with existence indicator
  and optional note count.
- `entityTemplateStatusLabel()` – Human-readable template status string.

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
