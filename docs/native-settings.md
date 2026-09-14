# Native settings

Entities declares one searchable settings tree through Obsidian's public
`getSettingDefinitions()` API. Each provider has a stable, readable page label,
allocated for the lifetime of the settings tab. Removing a provider does not
reassign its label to a different configuration. Sources, aliases, filter fields,
recipe fields, and provider-specific options are individual native definitions.
No settings data is created or saved while registering or searching the tree.

This draft proposes **Obsidian 1.13.4** as the minimum runtime and pins the public
**1.13.1 API declarations**. The required settings APIs are documented since
1.13.0. Actual minimum-version, native window movement, mobile, and IME acceptance
remain pending. Passing repository tests or extracted native-method probes does
not establish that runtime gate; this migration must remain a draft until it is met.

## Editing and recovery

Ordinary fields apply to the canonical settings store immediately. Applied
changes save automatically; disk failures keep those changes in memory and expose
Retry save. Source validity, canonical acceptance, and disk durability are separate
states. Folder and Dataview retain and diagnose exact invalid source/filter text.
The Template provider retains an invalid source folder as pending text until it
names an existing folder.

Recipe fields edit a pending collection. **Apply recipe changes** applies that
collection; **Discard recipe changes** reloads its current applied values. Every
already-configured recipe is visible, including disabled and unsupported recipes.
Each engine status describes its own recipe and identifies pending versus applied
values. Disabling one recipe does not disable its neighbors. An empty collection
shows one unpersisted disabled recipe that can be configured deliberately. There
are no new recipe engines, add/remove/reorder controls, or saved row identifiers.
Existing array order and unknown fields remain intact.

A field or collection changed concurrently in another view rejects a conflicting
edit and keeps the exact rejected value with its original baseline. Reload field
explicitly discards an ordinary field's draft. Recipe conflicts use the collection's
Discard action. Navigation, native refresh, hiding/reopening settings, and document
movement preserve detached pending/rejected drafts for the settings-tab lifetime.
Provider deletion and plugin disposal retire them. Drafts are never written to
`data.json`.

The generic stored icons for Template, Helper, Character, and Metadata Menu providers do not
control their suggestion output and have no native page appearance effect, so the
native tree does not offer those ineffective controls. Their values remain
preserved. Helper's checkbox and callout icons remain separate editable fields.

## Binding and lifetime

Providers return field-level definitions using the small `ProviderSettingsContext`
interface. A public `render(setting, group)` callback creates an individual owned
render. A WeakMap retains a same-row draft when Obsidian reuses a `Setting`, and
tab-owned records retain drafts when navigation recreates rows. Callbacks capture
their own session and guard; they never look up a replacement session for mutation.
Unexpected native key get/set calls fail closed, with setter feedback and no
inherited plugin or vault persistence. The plugin's detached canonical accessor
is `entitySettings`; native `Plugin.settings` is not a storage mirror.

Scalar edits compare the original field value; filter and recipe edits compare the
whole original array. Baselines advance only after canonical acceptance. Structural
filter edits retire all render callbacks for the captured collection before
rebuilding, so an old local index cannot address a different row. Every icon picker
captures a child draft with its original baseline. Its opening render owns both
opening and settlement; disposal cancels it, settles cancellation once, closes the
modal, and releases its registrations.

An ordinary DOM MutationObserver watches the captured document and rendered public
rows. Native provider pages can live outside the top-level tab container, so its
detachment does not retire connected rows. Actual row adoption retires the old input scopes, observes the
destination document, and requests a fresh native render once connected. Window
teardown and plugin teardown provide cleanup even when native row cleanup is absent.
The existing owned input suggester remains; see [input suggestions](input-suggestions.md).

Full native updates coalesce during composition. `compositionend` alone does not
rebuild: the final non-composing input must propagate first. A cancellation without
that input releases on blur or a later non-composing key/click interaction, after
its handlers and default effects. Removal, hiding, and disposal drop deferred work.
Focus restoration is confined to the previously focused field in the same active
document; a child modal or another window keeps focus.

## Verification

Repository regressions exercise the real SettingsStore and owned input helpers
with synthetic native Setting/DOM collaborators. They cover field discovery,
zero-write definition generation, same-type provider identities, scalar/collection
conflicts, detached drafts, explicit discard, storage recovery, child pickers,
document adoption/move-back, composition orderings, and shutdown despite cleanup
failure. Separate local probes execute unchanged extracted native binding,
rendering, reconciliation, and cleanup methods. Private host extracts are not part
of the repository or distributed plugin.

Public references: [migration guide](https://docs.obsidian.md/plugins/guides/migrate-declarative-settings)
and [API declarations](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).
