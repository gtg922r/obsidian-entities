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
│   ├── cli/            # Native Obsidian CLI handlers
│   │   └── EntitiesCli.ts
│   ├── entityCreation/ # Shared template-backed entity creation flow
│   │   ├── EntityCreationService.ts
│   │   └── EntityCreationSuggestions.ts
│   ├── EntitiesSuggestor.ts   # EditorSuggest implementation
│   ├── EntitiesSettings.ts    # Settings tab & modal
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
   - Registers native Obsidian CLI handlers when the host Obsidian version
     exposes `registerCliHandler`.
   - On unload, cleans up pending saves and resets providers.

2. **`EntitiesSuggestor`** – Implements `EditorSuggest`:
   - `onTrigger` detects trigger characters (`@`, `:`, `/`). `@` is phrase-scoped
     (spans spaces), while `:` and `/` are token-scoped (stop at whitespace).
     `@` takes priority when multiple triggers are present.
   - `getSuggestions` queries providers matching the trigger, applies caching
     based on each provider's `RefreshBehavior`, runs Obsidian's built-in fuzzy
     search, and deduplicates results.
   - Template creation suggestions are only requested from providers that
     support the `@` trigger and have templates configured.
   - `selectSuggestion` either inserts a `[[wikilink]]` or executes the
     provider's custom action.

3. **`EntitiesSettings`** – Settings tab where users add, configure, and remove
   provider instances. Provider classes supply their own settings UI via static
   `buildSummarySetting` / `buildSimpleSettings` / `buildAdvancedSettings`
   methods.

4. **Providers** – Each provider:
   - Extends `EntityProvider<T>` with strongly-typed settings.
   - Implements `getEntityList(query, trigger)` synchronously.
   - Declares supported triggers via the `triggers` getter.
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

### Entity Creation (`src/entityCreation/`)

Template-backed entity creation is shared between the editor suggester and the
native Obsidian CLI:

- `EntityCreationService` lists enabled provider creation targets, assigns
  stable ids, resolves ids or unique entity names, and calls the template
  creation utility.
- `EntityCreationSuggestions` adapts those creation definitions into the
  low-scored `New <Entity>: <query>` suggestion items used by the editor UI.

Providers expose `EntityCreationDefinition` objects through
`getEntityCreationDefinitions()`. This keeps provider discovery synchronous
while ensuring UI actions and CLI commands use the same target model.

### CLI (`src/cli/EntitiesCli.ts`)

`registerEntitiesCli()` registers the native `entities` and `entities:create`
commands through Obsidian's `registerCliHandler` API. The registration is
guarded so older Obsidian versions continue to load the plugin without CLI
support. Handlers resolve providers lazily on each invocation so settings
changes are reflected without a plugin reload.

## Major Interfaces

- **`EntityProvider<T>`** (abstract base class)
  - Holds provider settings and plugin reference.
  - Defines `getEntityList(query, trigger)` (sync) and optional template creation.
  - Exposes `getEntityCreationDefinitions()` for template-backed creation
    targets shared by suggestions and CLI commands.
  - Exposes `triggers` getter, `isEnabled` getter, and `getRefreshBehavior()`.

- **`ProviderRegistry`** (singleton)
  - Manages registered provider classes and instantiated providers.
  - `getProvidersForTrigger(trigger)` returns enabled providers matching a trigger.
  - `registerProviderType(cls)` / `instantiateProvider(settings)` for lifecycle.
  - `resetProviders()` clears instances (called during unload and settings changes).

- **`EntitiesSuggestor`** (extends `EditorSuggest`)
  - Collects and caches suggestions per provider with configurable refresh.
  - Performs fuzzy search and deduplication.
  - Handles text insertion and provider actions.

- **`EntityCreationService`**
  - Lists creation targets from enabled providers.
  - Resolves exact target ids and unique entity names.
  - Creates notes through the existing template utility and returns structured
    results for CLI formatting.

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
| `Default` | Refreshes when >200ms since last fetch |
| `ShouldRefresh` | Refreshes on every keystroke |
| `Never` | Fetched once, cached indefinitely |

## External Plugin Dependencies

Several providers integrate with optional external plugins:

- **Dataview** – `DataviewEntityProvider` uses the Dataview API with retry logic.
- **Natural Language Dates** – `DateEntityProvider` uses `nldates-obsidian`.
- **Templater** – Template creation in `EntityProvider` base and `TemplateEntityProvider`.
- **Metadata Menu** – `MetadataMenuProvider` reads file class definitions.

All dependencies are guarded: providers return empty results when their
dependency is missing.

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
