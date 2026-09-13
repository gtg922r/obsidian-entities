# Recovery fixture source

Every note and setting here is hand-authored test material. No real vault data,
plugin bundles, or integration settings are included. `notes/` becomes the vault
root; `legacy-data.json` becomes `.obsidian/plugins/entities/data.json`.

Settings use the unversioned `providerSettings` shape and provider defaults/types
at accepted master `02be703df0714eaa5dabbf093215b1da719e9e36`. There are deliberately
no future schema fields or provider instance IDs. Keep this old-settings input
stable so later migrations can be exercised. Source definitions are
`src/entities.types.ts`, `src/Providers/EntityProvider.ts`, and each provider's
`getDefaultSettings()` and user-settings interface.

People and Places are independent Folder sources; Projects and Reading are
independent Dataview sources. Each has a unique Sentinel note. `Atlas` and
`Navigator` intentionally collide. Places/Reading disable aliases to expose
ignored toggles. People enables recursion. Invalid metadata is isolated under
`Cases/` so it does not mask ordinary reproduction steps in the initial setup.

Templates contain only local fixture operations: basic text, an eight-second
delay, a local rename, and an intentional exception. They are inert
until a tester explicitly invokes them with Templater in the disposable vault.
The generator never evaluates template content. The failure template may leave
a partially created file in current integrations; record that outcome.

Use [the runtime acceptance guide](../../../docs/recovery/runtime-acceptance.md)
for generation, optional integration setup, exact expected results and evidence
records. Passing generator tests is not evidence that any runtime repair works.
