# Settings identity and recovery

`providerTypeID` chooses the provider implementation. `providerInstanceId` is an
opaque, persisted identity for one configured provider. Adding a provider assigns
a new random 128-bit ID using Web Crypto; runtime constructors never generate IDs.
Renaming, reordering, reloading providers, and restarting the plugin retain IDs.
Default factories remain ID-free and return independent nested data.

The version 1 settings document has `schemaVersion: 1` and an ordered
`providerSettings` array. The load boundary accepts unversioned documents,
preserves unknown top-level fields, provider fields and unavailable providers,
retains explicit `enabled: false`, and fills absent known defaults. Existing
nonempty string IDs are retained. All existing IDs are reserved before repairs;
the first occurrence of a duplicate keeps its ID, and later occurrences and
missing/empty IDs receive fresh random IDs. This repair policy is deterministic;
the generated values are intentionally random, not derived from row positions
or provider attributes. Running normalization on its output changes nothing.

Before writing a migrated or repaired document, the plugin saves the original
JSON values to a uniquely named `data.before-settings-v1-<id>.json` beside its
`data.json`, within the configured vault plugin directory. Existing backup files
are never overwritten. This copy contains settings only and remains private in
the vault. Backup failure leaves settings read-only. Fresh installs with no saved
data require no backup; valid current data creates no repeated backups.

Malformed data and unsupported schema versions enter a read-only recovery state.
No provider edit, retry-save, flush or unload can write that protected input.
Settings shows the error and a **Retry load** button. Fix the saved document or
restore a backup, then retry. Concurrent retries share a single read; once a load
succeeds, further load calls cannot replace unsaved edits. Unavailable provider
types remain visible and preserved until their implementation becomes available.

`SettingsStore` owns canonical state. Its snapshots are detached copies. UI edits
apply synchronously by ID; callbacks from deleted providers or after unload do
nothing. Pending disk writes belong to the store, with no module-global timer.
The writer starts in the next microtask and serializes asynchronous `saveData`
calls, coalescing queued changes into the latest snapshot. A failed write retains
dirty state and reports a notice plus **Retry save** in settings. Subsequent edits
or explicit flushes retry the current state, never an obsolete captured snapshot.

Closing the settings tab or provider modal requests a flush. Plugin unload closes
the store to edits and starts a final flush, including changes queued behind an
in-flight write. Obsidian does not await `onunload()`: the hook returns synchronously.
An abrupt process exit, terminated renderer, disk failure, or immediate plugin
restart while an old write is still running can prevent the final changes from
being durable. The store serializes its own lifetime; it cannot coordinate a
separate future plugin instance or an external editor writing `data.json`.
Prompt writes reduce this window but cannot remove it. Save while the plugin is
still enabled and resolve visible save errors before disabling or restarting it.

To restore a migration backup, disable the plugin, retain a copy of the current
`data.json`, and copy the desired backup over `data.json`. Then enable a compatible
plugin version. For downgrade, retain the matching older plugin artifact and its
original settings: older versions do not understand this store's write protection
and may write a newer document incorrectly. The automatic backup preserves the
pre-migration JSON data, not original whitespace or a history of later edits.

Provider authors should use `ProviderSettingsInput<T>` for runtime constructor
arguments and leave `getDefaultSettings()` ID-free. Configuration creation goes
through `SettingsStore.addProvider`; migration is the only other ID assignment
boundary. Cache work can read `provider.providerInstanceId` without depending on
class names or array positions. This change does not redesign the existing cache,
provider isolation, or suggestion/action contracts.
