# Disposable runtime acceptance kit

This kit prepares acceptance evidence for R2–R7 in [PROGRAM.md](./PROGRAM.md).
It does not implement those repairs. **No live Obsidian tests have been run for
this kit. Every runtime case below starts as NOT RUN.** Generator tests verify
filesystem behavior only. The coordinator owns live-app scheduling and release
acceptance; unavailable devices/integrations remain explicit gaps.

## Construct a fixture

Use Node **24.21.0 / npm 11.19.0** from the repository's pinned toolchain. No new
dependency is required by the generator. Supply an already built or extracted,
trusted artifact directory; this command neither builds nor downloads anything.
Build source artifacts only in an isolated checkout, never the installed plugin
in a development or personal vault. Preserve the artifact's source SHA/release
URL separately; matching version strings alone do not establish identity.

```sh
npm run fixture:recovery -- \
  --destination /absolute/existing-parent/NEW-entities-acceptance \
  --artifact /absolute/entities-artifacts
```

Use real absolute paths without symlink components or `.` / `..`. On macOS use
`/private/tmp`, not the `/tmp` symlink; `pwd -P` identifies a physical checkout
path. The destination must not exist, its parent must already exist, and it must
be outside existing vaults. Automatic ancestor-vault detection recognizes only
the default `.obsidian` marker. For vaults with custom configuration folders,
manually check that the destination is outside the vault. Re-running against a
created vault always fails.
Use a fresh destination to reset tests. Input artifact/fixture directories must
not be changed concurrently; this local utility is not a hostile-filesystem
sandbox. Root creation is exclusive, output files use exclusive creation, and
directory/file symlinks are rejected. Invalid inputs leave no destination.
An I/O failure after creation may leave an incomplete directory: inspect it,
choose a new destination, and do not treat it as acceptance evidence.

Only `main.js`, `manifest.json`, and optional `styles.css` are copied into
`.obsidian/plugins/entities`. The manifest must have ID `entities`, a name,
numeric `x.y.z` version/minAppVersion and boolean `isDesktopOnly`; malformed,
missing, empty required files and symlinked assets fail. JS bytes are never
evaluated by this command. External style resources are not bundled; if an
artifact relies on them, record that unsupported packaging dependency.
Artifact `data.json`, backups, source maps and all other files are ignored.

[Hand-authored legacy settings](../../tests/fixtures/recovery-vault/legacy-data.json)
are installed separately. They have two Folder sources (People, Places), two
Dataview sources (Projects, Reading), plus Template, Date, Metadata Menu, Helper
and Character providers. There are no R1 IDs or future schema assumptions.
`RECOVERY-FIXTURE.json` records artifact version, minimum version, SHA-256/byte
counts for installed artifact files and every initial fixture file, including
settings. Its `runtimeAcceptance: "NOT RUN"` describes creation time; keep actual
test results in a separate evidence record. No local source paths are recorded.

No plugin is enabled: `.obsidian/community-plugins.json` starts as `[]`. Open
this new vault manually only for the owner-coordinated smoke. Enable Entities
through Community plugins and start in `Writing/Scratch.md`. Do not enable Sync
or point an existing vault at this directory. Templates remain inert until a
tester deliberately invokes them.

## Optional integration setup

First test Entities with every optional integration absent. Separately test
installed-but-disabled, enabled before Entities, and enabled **after** Entities
has loaded and its menu has been opened (wait at least two seconds first).
Record each actual version and state. Install only through the tester's normal
trusted Obsidian installation process; this kit fetches/enables nothing. Configure
through each installed version's UI and record deviations; do not import private
settings. An unavailable or incompatible API means BLOCKED, never PASS for that
integration's positive cases. Unrelated providers should still function.

| Integration | Manual fixture configuration and scope |
| --- | --- |
| Dataview (`dataview`) | Wait for indexing. Saved queries are source expressions `"Sources/Projects"` and `"Sources/Reading"`, not full `TABLE` queries. Confirm the two source folders independently in Dataview before judging Entities. JavaScript queries need not be enabled. The API accepts folder source expressions: [Dataview query reference](https://blacksmithgu.github.io/obsidian-dataview/api/code-reference/#dvpagessource). |
| Core Templates | Enable the core plugin; set template folder to `Templates/Core`. Confirm `Core Person` works through the core command first. The legacy Entities settings also contain a core-engine creation case; it is not implemented on the baseline. |
| Templater (`templater-obsidian`) | Set template folder to `Templates/Templater`; leave automatic new-file/folder triggers and system commands off. `Person` renders a title; `Delayed Person` waits eight seconds; `Renamed Person` appends ` Renamed` to the created filename; `Failure` throws intentionally. Invoke rename/failure only for creation, and use Person/Delayed Person for insertion. Record partial files left by failures. [Templater file functions](https://silentvoid13.github.io/Templater/internal-functions/internal-modules/file-module.html) document title/rename behavior. |
| Natural Language Dates (`nldates-obsidian`) | Enable for date parsing; disable its own autosuggest to avoid competing menus. Record locale, clock, timezone and settings. First test with Daily/Periodic Notes absent, then configurations below. |
| Core Daily Notes | Set folder `Calendar/Daily`, format `YYYY-MM-DD`, template `Templates/Core/Daily.md`. Test existing `2025-12-29` / `2024-02-29`, absent `2024-03-01`, creation toggle off/on, and a creation failure. |
| Periodic Notes (`periodic-notes`) | Test separately from Core Daily Notes, then together to check precedence. Enable daily and weekly; daily as above, weekly folder `Calendar/Weekly`, ISO format `GGGG-[W]WW`, template `Templates/Core/Weekly.md`. Record calendar-set settings if present. Test existing `2026-W01`, absent `2026-W02`, rejected `2026-W00` / `2026-W54`, and `2025-12-29` belonging to ISO 2026-W01. Verify the plugin's own commands resolve these paths first. |
| Metadata Menu (`metadata-menu`) | Register `FileClasses/Fixture Person.md` as a file class using the installed version's UI; set file-class folder `FileClasses` and record its alias/configuration. The sample has `newNoteTemplate` pointing to the Person template and `newEntityIcon: user`; this alone is not proof it was indexed. Enable Templater separately. Verify recognized class, creation, cancellation, collision, missing template, late availability and failure. |

## Runtime and evidence matrix

Create a separate run record per device/runtime/artifact/integration state.
Fill exact installed versions at test time, including desktop **installer** and
app version; do not copy a “current” version from an old document. The fixture
baseline declares minimum `1.7.2`; the program proposes `1.13.4` for recovery,
pending owner confirmation. This kit changes neither the manifest nor the floor.

| Required environment | Version/device/tester/evidence | Initial status |
| --- | --- | --- |
| Desktop at the candidate's declared minimum | Unassigned; record exact installer/app and OS | NOT RUN |
| Desktop at proposed recovery minimum, if different | Unassigned; owner confirms floor and available installer | NOT RUN |
| Current stable desktop | Unassigned; verify current stable at execution | NOT RUN |
| Mobile at minimum supported release | Unassigned; owner confirms mobile floor and installability; record OS/model | NOT RUN |
| Current stable mobile | Unassigned; record actual iOS/Android coverage and unavailable platform | NOT RUN |

For unavailable versions/hardware mark BLOCKED with reason and responsible owner;
do not silently substitute a newer build. A version below the candidate's final
minimum tests clean refusal/upgrade messaging, not supported-runtime operation.
Run Source and Live Preview in each supported environment. Popouts/settings
windows apply where available; record N/A with platform reason, not PASS.

Copy this record outside Git for each run (no real vault contents):

```text
Run ID / UTC date / tester / responsible owner:
Device/model / OS / app version / installer version / mobile platform:
Artifact release URL or build source SHA / fixture-kit Git SHA:
RECOVERY-FIXTURE.json location / main.js + manifest.json + styles.css hashes:
Candidate minimum / integration names, versions, enabled states + settings:
Clock/timezone/locale / keyboard + IME / editor mode / window:
Link format + new-link path preference / source note path:
Case ID / exact steps and settings mutations / expected / observed:
Status: NOT RUN | PASS | FAIL | BLOCKED | N/A (reason required)
Evidence: screenshots/video, console output, before/after note and settings diff:
Issue/PR / next owner/action / retained artifact+settings rollback location:
```

Keep receipt/artifact bytes immutable as evidence; store changed notes/settings
separately. Recalculate installed asset hashes before and after the run and after
device transfer; compare to the receipt. Record actual created paths and opened
link targets, not just visible labels. PASS requires observed behavior on that
artifact; an expected CURRENT failure is still FAIL, not a waived release gate.

## Acceptance cases

CURRENT below means source-derived risk/expected defect on accepted baseline
`02be703df0714eaa5dabbf093215b1da719e9e36`, **not a recorded live-app result**.
Relevant source: [suggestor](../../src/EntitiesSuggestor.ts),
[providers](../../src/Providers), [filters](../../src/Providers/EntityFilters.ts),
[template utilities](../../src/entitiesUtilities.ts), [modal](../../src/userComponents.ts).
Run on the baseline to capture failures and again on the exact recovery candidate.
If an earlier defect masks a case, record it, isolate the source to continue, and
retain a BLOCKED result for the combined case until it can be executed.

| ID | Reproduction / CURRENT expectation | Required recovery-release behavior |
| --- | --- | --- |
| A1: sources, queries (R2) | Scratch `@Sentinel`: all four sources. Narrow `@People Sentinel`, backspace to `@`; this checks query-independent Folder/Dataview lists only. Also run the controlled Character `:cat` → `:ca` case below. CURRENT class-name cache reuses same-type lists; query-dependent Character results can remain restricted to `cat` within the 200 ms cache window. | Four distinct sentinels with integrations ready. Broadening to `:ca` immediately includes cactus 🌵, matching fresh `:ca`; narrowing to `:cat` excludes it. Query broadening and rapid typing refresh without stale/missing results. Lookup remains synchronous/responsive. |
| A2: reload, failures (R2) | Keep `@Sentinel` open while removing/disabling/reconfiguring/reordering its source; attempt old selection. Rename/delete/create a Sentinel; try a missing Folder path. Test invalid Dataview query feedback in UI. CURRENT UI does not save invalid queries: for lookup failure, close Obsidian in a separate disposable run, edit Projects' saved query to `(`, reopen. CURRENT caches/open suggestions can survive replacement; query exceptions can escape. | Old suggestions cannot execute after configuration changes; data refreshes. One source's construction/lookup/creation-suggestion failure cannot blank others. Restore valid configuration without restart. Record any fault path requiring an owner-provided debug build as BLOCKED until executed. |
| A3: links (R3) | `@Atlas` has four paths. Enable all aliases and try `@Navigator`; inspect every resulting target from `Writing/Scratch.md` and a source-folder note. CURRENT display-text dedupe and basename-only wikilinks lose identity. | Distinct targets/aliases remain selectable with path/source context; selecting each opens its intended TARGET line. Test wikilinks and Markdown links, shortest/relative/vault-absolute path preferences, Unicode aliases and spaces. Repeated references to the same file/alias dedupe appropriately; distinct same-label actions remain available (configure two templates with identical entityName). |
| A4: semantics (R5) | Toggle aliases independently in Places/Reading and recursion in People/Places. Include `active:^false$`, then `score:^0$`; exclude `absent:.+`; regex `[`. Point one source at each isolated `Cases/` folder. CURRENT toggles are ignored, false/zero treated as absent, malformed aliases may throw. | Toggles persist and work; scalar/list aliases normalize without losing real targets. Missing/false/zero/null/invalid values remain distinct; malformed values/regex/query give useful feedback or fail soft. Configure property aliases from `username` when R5 exposes them; select string/list values and verify original file identity. Current property-alias UI is incomplete. |
| A5: dependencies (R2/R5/R6) | Execute every optional-state transition above, including late enable after first menu, unload/re-enable integration, and incompatible version/API if available. CURRENT Date/Metadata capture dependencies at construction; Dataview retries are bounded at startup. | Status reflects capability; absent integrations leave ordinary entities/helpers usable. Late availability is discovered without restarting Entities; dependency removal fails softly. Positive integration cases remain BLOCKED when unavailable. |
| A6: creation (R4) | Fresh vault for each: New Person, `/Person` name-modal Escape/close, `Collision`, renamed variant, Failure, missing template, and unavailable Templater. Double-select while pending. CURRENT cancellation can leave a pending promise; creation returns guessed links without confirmed file success. | Cancellation settles, leaves sentence intact and no duplicate work. Existing Collision content survives; chosen collision policy is explicit. Link uses actual created/renamed path. Failure gives no success link; report partial files distinctly. Core-engine case must follow owner-approved supported behavior, not silently disappear. Successful insertion undo restores the trigger in one step. |
| A7: pending action (R4) | Use Delayed Person's eight-second wait. Separately edit inside/outside the trigger, switch away/back, replace text, reuse editor for another file, delete source, close popout, disable plugin. Repeat with Template actionType=insert: type `/Delayed` and select Delayed Person (slash queries stop at spaces); inspect both documents. CURRENT insertion validates neither revision nor lifecycle; Templater also mutates the active editor itself. | No stale write or mutation of another document; cancellation/failure is handled. A successfully created file remains discoverable even when insertion is cancelled. Verify actual integration mutations, not only the final link; no unhandled rejection. |
| A8: dates (R4/R5/R6) | Run the daily/weekly table, create off/on, core-only/Periodic-only/both, invalid weeks, leap date, year boundary, `@tomorrow`. CURRENT week bounds/year mapping and failure fallback need validation. | Correct configured folders/formats/precedence and existing-note identity; invalid dates do not create bogus files. A deliberate unresolved link is distinguishable from successful creation; failures cannot masquerade as creation. |
| A9: input/windows (R6) | `@Zoë 東京`, `:smile`, `/todo`: arrows/Enter/Escape, mouse/touch, IME composition, mobile keyboard selection. Repeat main/popout, settings in another window, and Source/Live Preview. CURRENT private UI/window boundaries are unverified. | No premature IME commit, double insertion, lost caret or orphan menu. Settings search/window edits target the intended source. Ten load/settings/unload/re-enable cycles produce no duplicate menus/listeners or stale results; closing/reopening windows cleans up. |
| A10: artifact/release (R7) | Run minimum/current matrix, verify hashes before/after and on mobile transfer; package identity/install path. CURRENT kit has no live evidence. | Exact tested assets retained for promotion; version/tag/manifest/assets agree. Record install/upgrade/refusal behavior, BRAT sessions, and owner signoff. This small vault cannot certify large-vault performance: record cold start/suggestion latency and method on separately authorized representative data. |

For **A1's timed Character case**, enable emoji suggestions. The bundled
dictionary has `cactus` (🌵) for `ca`, but not `cat`. Do not rely on manual typing
speed: intermediate `:`, `:c`, or `:ca` requests can seed a broader cache and mask
the defect. Use an owner-approved timed harness against the installed artifact's
actual suggestor, Character provider and dictionary, with real Scratch editor/
file contexts and no intervening lookups. The harness must:

1. Leave the Character cache untouched for over 200 ms, then issue `:cat` as a
   single lookup and verify an actual provider refresh for `cat`.
2. Immediately issue `:ca`, recording monotonic timestamps at both suggestor
   entries and the actual `cat` cache-refresh timestamp. Require the `:ca` entry
   to be less than 200 ms after that refresh; record both suggestion sets.
3. After a further untouched interval over 200 ms, issue fresh `:ca`, verify its
   provider refresh, and compare the result sets, specifically cactus 🌵.

Retain harness revision, timestamp/refresh trace and results alongside artifact
identity; distinguish this instrumented lookup evidence from manual menu/input
smoke. If instrumentation changes the cache/query behavior, timestamps cannot
establish the cache age, or the device cannot run the harness reliably, mark the
timed path **BLOCKED**. The kit provides the procedure, not a timed harness or a
runtime PASS; slow manual broadening alone cannot clear this case.

## Old-settings upgrade, recovery and rollback (R1/R7)

All steps are NOT RUN; use disposable fixture copies and owner-supplied previous
and candidate artifacts. The generator always starts a new vault; it deliberately
does not implement in-place upgrades or recovery decisions.

For every manual settings replacement below, **fully quit Obsidian** (including
other vault windows/processes), not merely disable/re-enable Entities or close a
note/window. An in-memory dirty predecessor can otherwise overwrite restored
`data.json` on re-enable. Use the platform's full app-termination procedure on
mobile and record it. Follow the accepted [R1 recovery procedure](../settings-recovery.md).
R1 at `1773e4c` uses schema version 1 and `data.before-settings-v1-<id>.json`
backups beside `data.json`. Those backups preserve JSON values, not original
whitespace; retain the separate original-byte copy for exact rollback evidence.
The fixture input stays unversioned so it exercises migration.

1. Generate the old-artifact vault, explicitly enable it, exercise a few settings
   and record the resulting bytes. Disable Entities and close Obsidian. Preserve
   `data.json` plus the **entire allowlisted previous artifact set** outside the
   vault, with checksums. Also retain pristine legacy-data.json for repeatability.
2. With Obsidian closed, manually replace only Entities artifact assets with the
   candidate (remove an old styles.css if absent in candidate). Leave the old
   `data.json` intact. Record both asset identities and the upgrade steps; the
   original generator receipt still identifies the old installation.
3. Enable candidate. Verify all nine configured sources, independent edit/delete/
   reorder/reload, migration idempotence across restart, and an original-data
   recovery copy before any schema-changing write. Verify unknown root/provider
   fields and an unknown provider survive using a separate hand-edited legacy
   copy (`fixtureUnknown: {"keep": true}` and a disabled `fixture-unknown` provider).
4. In separate copies while closed, replace settings with malformed JSON (`{`),
   a wrong shape (`{"providerSettings":42}`), or a future schema. For accepted
   R1's version 1, set `schemaVersion: 2` in a separate copy of its saved document;
   reconfirm the candidate's documented schema before testing later revisions.
   Try UI edits, retry, reload and unload: protected input bytes must remain
   unchanged. Exercise failed reads, existence checks, original-backup writes
   and settings saves through actual Obsidian storage paths: convenience wrappers
   and `exists` can swallow I/O failures or present them as missing data. Confirm
   ambiguous storage failure never initializes/overwrites protected input as
   though it were a fresh install. Force a save failure only in the disposable vault using an
   owner-approved local method; record the method, notices, retry and final data.
   If not reproducible on a device, mark that path BLOCKED.
5. Follow the accepted recovery instructions using the preserved original;
   verify recovery is explicit and sources are intact. To test rollback, disable
   Entities, close Obsidian, then restore **both** previous assets and original
   pre-migration data, removing candidate-only assets. Re-hash before reopening;
   old provider configuration and writing behavior must match. A Git revert
   alone cannot undo a settings migration.

Do not deploy migrated builds into a real vault from this kit. Coordinator
acceptance must resolve settings loss, wrong targets, stale editor writes and
misleading creation success before release, then record actual desktop/mobile
dogfood sessions separately.
