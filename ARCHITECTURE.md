# Architecture Overview

This document explains the overall layout and flow of the **Entities** Obsidian plugin.

## Directory Structure

```
.
├── src/                # TypeScript source
│   ├── Providers/      # Autocomplete providers
│   ├── ui/             # Reusable UI helpers
│   ├── EntitiesSuggestor.ts
│   ├── EntitiesSettings.ts
│   ├── entities.types.ts
│   ├── entititiesUtilities.ts
│   ├── userComponents.ts
│   └── main.ts         # Plugin entry point
├── tests/              # Jest unit tests
├── styles.css          # Plugin styles
├── manifest.json       # Obsidian plugin manifest
├── esbuild.config.mjs  # Build configuration
└── package.json
```

### Providers

`src/Providers` contains implementations that supply suggestion items. Each provider
extends the `EntityProvider` base class and registers itself through
`ProviderRegistry`. Examples include:

- `FolderEntityProvider` – suggestions from a folder of notes
- `DataviewEntityProvider` – suggestions from a Dataview query
- `TemplateEntityProvider` – insert or create notes from templates
- `DateEntityProvider` – natural language dates
- `MetadataMenuProvider` – integration with Metadata Menu
- `HelperActionsProvider` – utility commands (checkboxes, etc.)
- `CharacterProvider` – emoji or symbol look‑ups

## Plugin Flow

1. **`main.ts`** – When the plugin loads, it
   - reads saved settings,
   - initializes a singleton `ProviderRegistry`,
   - registers the available provider classes,
   - instantiates providers from settings,
   - creates an `EntitiesSuggestor` and registers it with Obsidian.
2. **`EntitiesSuggestor`** – Implements `EditorSuggest` to show autocomplete
   results. `onTrigger` detects trigger characters (`@`, `:`, `/`). It then asks
   the registry for providers matching that trigger, gathers suggestions, runs
   fuzzy search, and renders the list. Selecting an item inserts text or
   performs the provider’s action.
3. **`EntitiesSettings`** – Implements the settings tab UI where users configure
   provider instances. It uses provider‑supplied helper methods to render both
   summary and advanced settings.
4. **Providers** – Each provider implements `getEntityList` to return
   suggestions and may override `getTemplateCreationSuggestions` to create new
   entities. Providers declare which trigger characters they support.
5. **Utilities and UI Components** – Helper modules under `src/ui/` and
   `userComponents.ts` supply reusable UI pieces such as suggestion modals and
   file/folder choosers. `entititiesUtilities.ts` wraps Templater functions for
   template insertion and note creation.

## Major Interfaces

- **`EntityProvider`** (base class)
  - Holds provider settings and plugin reference.
  - Defines `getEntityList(query, trigger)` and optional template creation
    methods.
  - Exposes a `triggers` getter describing which characters activate the
    provider.
- **`ProviderRegistry`**
  - Singleton that tracks registered provider classes and instantiated providers.
  - Provides `getProvidersForTrigger` to retrieve providers matching a trigger
    for the suggestor.
- **`EntitiesSuggestor`**
  - Collects suggestions from providers, performs fuzzy search, and inserts the
    chosen result into the editor.

### Provider Registry Interface

`ProviderRegistry` resides in `src/Providers/ProviderRegistry.ts` and acts as the
central hub for managing entity providers. It exposes several helpers used
throughout the plugin:

- **RegisterableEntityProvider** – type describing provider classes that can be
  registered. Such classes extend `EntityProvider`, define a static
  `providerTypeID`, and implement static methods like `getDescription`,
  `getDefaultSettings`, and `buildSummarySetting` (with optional
  `buildSimpleSettings` and `buildAdvancedSettings`). These are leveraged by the
  settings UI.
- **registerProviderType(cls)** – registers a provider class under its
  `providerTypeID` so it can later be instantiated from settings.
- **instantiateProvider(settings)** – constructs a provider instance given its
  saved settings and stores it in an internal array.
- **instantiateProvidersFromSettings(list)** – recreates all provider instances
  from a list of saved settings, typically on startup or after the user saves
  changes.
- **getProvidersForTrigger(trigger)** – filters the instantiated providers by
  the trigger characters declared by each provider via the `triggers` getter.
- **getProviderClasses()** – exposes the map of registered classes so the
  settings tab can populate the "Add New Provider" dropdown.
- **resetProviders()** – clears existing provider instances prior to reloading
  them from updated settings.

## Testing and Build

- Tests reside under `tests/` and use Jest with `ts-jest`. Example tests cover
  the suggestor and provider registry.
- `esbuild.config.mjs` bundles the plugin to `main.js`. The `build` script also
  runs TypeScript type checking.

## Further Exploration

To extend the plugin, examine existing providers under `src/Providers` and see
how they integrate with external plugins or custom logic. Adding a new provider
involves subclassing `EntityProvider`, registering the class in `main.ts`, and
adding configuration UI in `EntitiesSettings.ts`.
