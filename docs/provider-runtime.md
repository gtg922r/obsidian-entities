# Provider runtime contract

A configured source is identified by its persisted `providerInstanceId`, not its
class name or row position. The settings store assigns identity; constructors
receive it via `ProviderSettingsInput<T>`. R2 does not change settings migration,
storage or handoff. See [settings recovery](settings-recovery.md).

`getEntityList(query, trigger)` stays synchronous. `isQueryDependent` defaults to
`true`: changing the query invalidates that provider/trigger entry immediately.
Override it with `false` only when ordinary retrieval is independent of the typed
query for fixed settings and trigger. Folder, Dataview, Template and Helper use
`false`; Metadata Menu also uses `false` because its ordinary list is empty.
Character and Date retain `true`. `getTemplateCreationSuggestions(query)` is a
separate query-sensitive, uncached stage and only runs for eligible `@` providers.

Each suggestor cache entry records provider object/ID, trigger, relevant query,
timestamp, registry revision and data revision. There is at most one current
query entry per provider/trigger pair. `ShouldRefresh` evaluates every request;
`Default` preserves the existing >200ms age threshold; `Never` skips only age
expiry. All modes respect relevant query changes and explicit invalidation.
A failed refresh discards previous success and is retried on the next request;
there is no stale-success fallback or permanently cached failure. Valid empty
arrays can be cached. Arrays containing malformed items contribute their valid
items but are retried rather than cached.

Ordinary items are copied into the raw cache and fuzzy-filtered into fresh result
objects per request. Query-specific fuzzy scores never mutate cached/provider
objects. Existing score ordering, ordinary-before-creation precedence and
same-label deduplication remain unchanged. Semantic target deduplication and
native link generation belong to R3.

`ProviderRegistry.instantiateProvidersFromSettings()` constructs every row with
its own error boundary, then publishes one complete list and increments its
monotonic `revision`. Unknown types and failed constructors remain preserved in
the canonical settings and inactive at runtime. `onChange()` returns a cleanup
function. The suggestor subscribes once and disposes that subscription on unload.
Configuration replacement—including edit, deletion, disable, reorder, trigger
change and reload—clears caches, closes old menus and clears the remembered
dismissal span, so the same text can reopen with current settings.

`main.ts` registers these listeners once through `registerEvent()`:

- Vault: `create`, `rename`, `delete`.
- MetadataCache: `changed`, `deleted`, `resolved`.
- MetadataCache integration events: `dataview:metadata-change`,
  `dataview:index-ready`, `dataview:api-ready`, `metadata-menu:indexed`,
  `metadata-menu:fileclass-indexed`, `metadata-menu:fields-changed`.

Data/index events advance only the data revision, marking the cache dirty while
keeping the displayed results selectable. They neither close the menu nor
advance its result epoch. The next request evaluates current data and replaces
the result epoch, making callbacks from the previous batch obsolete.
Layout readiness uses the same invalidation path with an unload/instance guard.
Obsidian lifecycle cleanup releases listeners; unload also disposes the suggestor
immediately. Deferred callbacks cannot revive it. No generic plugin-enable event
is assumed and there are no provider timers or background queries.

Dataview resolves its current API synchronously on evaluation. Its existing
settings-UI retry helper remains separate. Metadata Menu resolves its current
plugin/index for each creation request; Date resolves NLP and Periodic Notes
capabilities for each ordinary evaluation. Template repeats its existing shallow
folder scan during evaluation. Recursion, aliases, provider setting semantics,
and malformed metadata normalization are deferred to R5. The bounded freshness
fallback remains necessary for unobserved integration lifecycle/settings changes.

Eligibility, cache-policy access, ordinary retrieval and creation retrieval have
independent error boundaries. An ordinary/policy failure cannot suppress that
provider's valid creation results, and a creation failure cannot suppress its
ordinary results. Invalid suggestion text, display fields, action shape or match
shape cause the individual item to be skipped. Console diagnostics retain at
most one marker per live provider/stage, via weak ownership; there are no
per-keystroke notices or growing historical error sets. Constructors report once
per attempted configured row.

Returned clones have private `WeakMap` provenance: provider object (and its
persisted ID), registry revision, result epoch and retrieval context. Before
selection, the suggestor verifies the current epoch, revision and provider
membership. Retained callbacks from replaced configurations or older result
batches do nothing. Ordinary menu close does not advance the epoch, so valid
selection works whether the host closes before or after invoking it.

After awaiting an action, a second check gates only provider generation and
unload, so normal close or an index event from the action itself does not discard
its returned string. It does **not** cancel action side effects, detect document
switches/edits, validate replacement ranges, or solve cancellation, double
selection and undo. Those editor/action guarantees remain R4. Public
`EntitySuggestionItem` and action signatures are unchanged.

`tests/RuntimeFreshness.test.ts` exercises cache timing/bounds, concrete provider
instances, fault isolation, runtime events and retained selection with controlled
mocks. It does not prove real Obsidian popover ordering or integration startup;
those require a focused smoke in the dedicated disposable fixture vault.
