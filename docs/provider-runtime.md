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
objects. Target wrappers are detached at both boundaries; the actual `TFile` and
callback references are retained. Never serialize targets with JSON/cloneSettings
or reconstruct a host file. Existing score ordering and ordinary-before-creation
precedence remain. Semantic deduplication follows matching: keep the best score,
then the first provider in traversal order on ties. Keep that original winning
result. If adding a presentation clone, copy its **existing** private provenance;
never stamp an old row with the current result epoch.

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

Lookup data/index events advance only the data revision, marking the cache dirty while
keeping the displayed results selectable. They neither close the menu nor
advance its result epoch. The next request evaluates current data and replaces
the result epoch, making callbacks from the previous batch obsolete.
Separate source delete/rename observers invalidate editor bindings; target changes
remain lookup-only. Layout readiness uses the same cache invalidation path with an unload/instance guard.
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
ordinary results. Invalid suggestion text, display fields, target variant or match
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

At selection entry, ignore composition confirmation, validate the retained source,
and consume the displayed result synchronously. One current pending operation per
Editor rejects fresh duplicate retrieval of the unchanged source span. Started
work checks registry/provider/unload validity independently of result epochs,
data revisions and menu visibility. Invalidated old work cannot clear a newer slot.

Callbacks receive `ActionContext`: copied source file/path, full document snapshot,
exact trigger offsets/text/query, all selection offsets and `canStartWork()`. The
wrappers are immutable; the native TFile is retained without freezing it. There is
no Editor, mutable suggest context, row or active-editor fallback in this contract.
After a prompt/await, check `canStartWork()` immediately before engine invocation,
alongside the prompt's own lifetime guard.

Return `ActionResult`: R4a `created`/`existing` with actual file and optional alias,
`cancelled`/`failed`, an intentional non-action `target`, one `edit`, or
`unavailable`. String/void/malformed outcomes fail once without cleanup edits.
Providers do not format native links or mutate editors. The coordinator validates
public binding, source identity/path, immediate edit revision, delivered activation,
full document, selections and range before one named transaction, with no await
between final checks and commit. A created file remains created if insertion fails.
Trusted native effects already running cannot be rolled back by this guard.

`tests/RuntimeFreshness.test.ts` exercises cache timing/bounds, concrete provider
instances, fault isolation, runtime events and retained selection with controlled
mocks. It does not prove real Obsidian popover ordering or integration startup;
those require a focused smoke in the dedicated disposable fixture vault.


## Targets and selection

Import `EntitySuggestionItem` and `SuggestionTarget` from `src/suggestion.types.ts`,
which has only type imports and no UI implementation dependency. A suggestion has
one required `target`; top-level `replacementText`/`action` fields are rejected.
Keep `suggestionText` for recognition/search and `icon`, `flair`, `noteText`, `match`
for presentation. Never encode insertion meaning in a label.

| Target | Meaning and identity |
| --- | --- |
| `{ kind: "file", file, alias? }` | Actual live `TFile` identity plus effective alias; shared across providers. |
| `{ kind: "unresolved-link", linkpath, alias? }` | Deliberately unresolved destination plus effective alias, separate from real files. |
| `{ kind: "text", text }` | Exact literal text, including Unicode sequences; shared across providers. |
| `{ kind: "action", id, callback }` | Deterministic operation ID scoped to the configured provider instance. |

Keys are structured JSON tuples. Omitted and empty aliases use the native default;
all other aliases are preserved exactly, including whitespace, case and Unicode.
For Markdown files the default alias is undefined. For other files the default
alias is `file.name`, making native Markdown attachment links visible; deduplication
uses this same effective alias. Explicit nonempty aliases stay exact, even if they
look like the basename. Different file objects (including delete/recreate at the
same path), aliases, target kinds and provider-scoped operations stay distinct.

Folder keeps each actual `TFile` and separate aliases. Dataview resolves the exact
`project.file.path` to a live `TFile`, skipping missing paths and folders; it never
falls back to the displayed name. Its pages and aliases accept the iterable
DataArray returned by the [Dataview API](https://github.com/blacksmithgu/obsidian-dataview/blob/master/src/api/plugin-api.ts);
ordinary results are materialized into a synchronous array. Character returns literal targets. Template
IDs encode operation + template path. Base creation IDs encode engine, template
path, destination folder and query. Metadata Menu encodes file-class path,
template path and query; Helper encodes the operation and its argument. Template
rows show the operation and template path in their secondary note, never raw IDs.
No new persisted template-row IDs are introduced.

At real-file selection, `vault.getAbstractFileByPath(file.path) === file` must hold.
A renamed live file uses its current path. A deleted/replaced file gives a notice
and no editor write. Native formatting is evaluated at selection as
`app.fileManager.generateMarkdownLink(file, capturedSourcePath, undefined, effectiveAlias)`.
Source context comes from R2 provenance, never whichever editor happens to be
active. Preferences changed after caching take effect; fresh retrieval for another
source can reuse cached raw targets. Formatting failure gives a notice without
an editor write or guessed fallback. The native string is passed through unchanged.

The deliberate unresolved-date boundary remains explicit wikilinks, even
under Markdown preferences. Date splits linkpath/alias at its producer, with no
generic parsing of pipe-containing strings and no fabricated files or private
preference reads. Date creation callbacks return actual creation outcomes and their operative alias;
a failed creation never falls back to an unresolved success. Their IDs include granularity/date, operative
output alias (`today` versus `this sunday`), and fallback linkpath/alias.

## Evidence boundary

Focused target tests cover duplicate basenames/aliases, cross-provider identity,
ranking/provenance, source contexts, wrapper isolation, malformed targets and
selection after background invalidation. Mocked generator outputs test exact
forwarding, not Obsidian rendering. Separate local method-level checks execute
actual Obsidian 1.12.7/1.14.1 native formatting with inert vault indexes/preferences
(240 cases per version), including exact forwarding through this suggestor and
selection-time source/preferences/file-event checks. The actual installed Dataview
0.5.66 DataArray class/proxy also passes the provider/suggestor alias flow.
These historical R3 method checks do not prove R4b live UI behavior or the proposed minimum-version gate.

Native aliases and unusual filenames have host quirks: e.g. `A]]B` can produce
`[[Unique Note|A]]B]]`; `#`, `%` and parentheses in destinations are not generally
escaped. R3 adds no escaping/parser layer. Unusual punctuation/filename rendered
resolution, live UI and actual runtime created-file insertion remain unverified host
acceptance cases for the coordinator's dedicated fixture run. Do not infer
arbitrary punctuation safety from a successful native-string parity check.

R4b tests additionally exercise real CodeMirror state/view/extension lifecycle with
synthetic public Obsidian events, including edit→undo, focus changes, binding reuse,
missing fields, malformed results and duplicate selection. Separate inert native
transaction evidence confirms old-document change coordinates and resulting-document
caret coordinates. These are not live Source/Live Preview/popout or undo acceptance.
Template insertion rows always return `unavailable`, preserving configuration and
text; their message names the manual Templater command and exact template path.
