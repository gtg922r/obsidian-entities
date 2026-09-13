# Agents Guide

This repository contains an Obsidian plugin that provides context‑aware autocomplete via pluggable “entity providers.” Keep changes tight, idiomatic, and aligned with the existing architecture and TypeScript style.

## Start Here
- Purpose and features: `README.md:1`
- Architecture and flow: `ARCHITECTURE.md:1`
- Entry points and key files:
  - Plugin entry: `src/main.ts:1`
  - Suggestor (UI + search): `src/EntitiesSuggestor.ts:1`
  - Provider base + types: `src/Providers/EntityProvider.ts:1`, `src/entities.types.ts:1`
  - Provider registry: `src/Providers/ProviderRegistry.ts:1`
  - Settings UI: `src/EntitiesSettings.ts:1`
  - Utilities/UI: `src/actionCoordinator.ts:1`, `src/editorBindings.ts:1`, `src/userComponents.ts:1`

## Mental Model
- Triggers: `@` (entities), `:` (symbols), `/` (actions). The suggestor parses the line, detects a trigger, and requests provider suggestions for that trigger.
- Providers: Return a synchronous array of `EntitySuggestionItem` objects; each item has an explicit file, unresolved-link, text or action `target`. Actions return typed outcomes to the insertion coordinator.
- Registry: Manages provider classes and instances, and filters by trigger.
- Caching/refresh: Providers declare `getRefreshBehavior()` to balance responsiveness and performance.

## Adding or Modifying a Provider
1. Subclass `EntityProvider<TSettings>` and define:
   - Static: `providerTypeID`, `getDescription`, `getDefaultSettings`, `buildSummarySetting` (and optionally `buildSimpleSettings`, `buildAdvancedSettings`).
   - Instance: `getDefaultSettings()`, `getEntityList(query, trigger)` (sync), and if needed `getTemplateCreationSuggestions(query)`.
   - Triggers: Override `triggers` getter if not `@`.
2. Register your class where providers are registered (see `src/main.ts:1`).
3. Provide a settings shape `TSettings extends EntityProviderUserSettings` and use the settings UI helpers to render controls succinctly.
4. When integrating other plugins, guard for absence and surface status in the summary setting (see `DateEntityProvider` for patterns).

## Coding Conventions
- TypeScript:
  - Respect `noImplicitAny` and `strictNullChecks` (see `tsconfig.json:1`).
  - Prefer precise types, `readonly` where helpful, and narrow unions over `any`.
  - Keep provider APIs synchronous to match `EntitiesSuggestor` usage.
- Style:
  - Follow ESLint rules in `.eslintrc:1`; avoid unused vars and unnecessary ts‑comments.
  - Honor `.editorconfig:1` (tabs, LF, final newline).
  - Keep changes minimal and cohesive; avoid drive‑by refactors.
- UX:
  - Suggestion items set `suggestionText` and one typed `target`; optionally include `icon`/`flair` and concise `noteText`.
  - Action callbacks receive immutable `ActionContext` and return `ActionResult`, never strings/void or preformatted links. Recheck `canStartWork()` immediately before starting an engine after any await. Providers never receive or mutate an Editor; return one calculated edit or an actual creation result.

## TSDoc Guidance
- Document exported classes, interfaces, and non‑trivial functions.
- Be concise and purposeful: one‑line summaries, `@param`/`@returns` only when clarification adds value.
- Prefer explaining constraints and side‑effects over restating types.
- Avoid redundant or noisy comments; rely on clear naming and types.

## Testing & Verification
- Tests live under `tests/` (see `tests/EntitiesSuggestor.test.ts:1`). Add focused unit tests for provider logic and suggestor behavior.
- Run `npm test` locally; ensure deterministic tests without Obsidian runtime by mocking as shown in existing tests.
- Build with `npm run build` before submitting changes.

## Performance & Safety
- Use `RefreshBehavior` to avoid excessive recomputation; `ShouldRefresh` only when suggestions must update per keystroke.
- Avoid blocking or network work in providers; compute quickly and synchronously. Cache as appropriate inside the provider.
- Fail soft when dependent plugins are missing; never hard‑crash the suggestor.

## Pull Request Checklist
- Clear, single‑purpose changes with passing tests.
- Lint clean and type‑safe.
- Provider registered and discoverable in settings; docs and labels are user‑facing and concise.

