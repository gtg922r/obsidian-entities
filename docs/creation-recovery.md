# Confirmed creation and guarded insertion (R4a/R4b)

Choosing a creation action now awaits the integration and links only its returned,
live vault file. Native link formatting uses the source path captured before the
first await, including after a rename or unique-name suffix. An undefined return,
rejection, unavailable capability, invalid template or destination produces a
bounded notice and no replacement. Closing a name prompt cancels it; unload or
provider replacement closes owned prompts and prevents subsequent engine startup.

`entityCreation.ts` provides editor-independent `created`, `existing`, `cancelled`
and `failed` outcomes. Template creation uses Templater's unique-name behavior;
periodic creation checks for an existing live note before invoking the current
Periodic Notes integration. Neither adapter guesses target filenames or partial
ownership from vault events. Template strings mean vault paths and are resolved
to live `TFile` objects before native invocation. Creation capability is checked
independently of append capability on each action.

Recipe destinations are explicit: missing, empty and the folder picker's canonical
`/` value mean the actual vault-root `TFolder`. Valid nonempty relative paths retain
Templater's creation of missing parents. Other absolute paths, escaping components,
invalid names and existing file/folder collisions fail. Parents remain after later
failure. Template and Metadata Menu actions have no destination setting, so their
callbacks capture Obsidian's default parent through public
`getNewFileParent(sourcePath, proposedPath)` before prompting or awaiting creation.
The proposed path uses the actual output extension; `Meeting.canvas.md` uses the
Markdown policy, and a `.canvas` template keeps the existing non-Markdown behavior.

Native formatting rechecks target identity. If formatting fails or the file was
deleted after confirmed creation, feedback retains the known creation status and
path; Entities does not retry the engine or insert a guessed link. The optional
`partialFile` result field requires causal ownership evidence. The inspected
native engines do not supply that evidence on failure, so their failures omit it.

The first-recipe editor retains unknown fields and all untouched tail recipes.
Legacy Core recipes remain valid stored data and show an unsupported state; Core
is not offered for new recipes or implemented as a new engine. Saving settles
before closing; Escape, Cancel and other closure settle once as cancellation.
R1's provider-ID ownership and stale-collection conflict rejection remain in use.

## Evidence and remaining limits

Focused regressions exercise real service/provider/modal/settings boundaries with
synthetic Obsidian objects and integration operations. An additional inert harness
extracted the unchanged creation method from Templater 2.11.1 and 2.25.0. Seven
cases passed on each: explicit root, collision suffix, rename identity, missing
parents, string-as-content semantics, parser failure, and write rejection. It uses
synthetic vault/parsing/lifecycle functions; it is not live runtime acceptance.
Inspected distribution SHA-256 values:

- 2.11.1: `41ba4ea7560d13d85f3a9be009aefd5a66de287322da52e9fade3ead81b06935`
- 2.25.0: `6a29790e8ad3bb3de5bcc7381588f20093b2dbecc1ff27d8a5d7ed3fcebbdf4e`

Native Templater itself deletes its new file after parser failure, retains created
parents, and may reject on a later write while leaving an unreported partial file.
Entities adds no deletion or rollback. Trusted template scripts/hooks can have
independent effects. The separate native parser/module harness reproduced shared
configuration contamination during concurrent Templater runs; confirmed returned
file identity does not imply isolation or correctness of concurrent template content.

R4b supplies typed action outcomes and an editor coordinator. All Entities-owned
edits, including ordinary links and Helpers, go through one public transaction
with explicit completion origin and resulting-document caret. Captured source
identity/path, full document, exact trigger, selections, public binding, delivered
edit revisions and observed activation generations must remain valid. A delivered
edit then undo cancels pending insertion. Fresh retrieval, menu close, modal blur,
return to the same editor, unrelated layout and target/index events alone do not.
A pending Editor slot prevents duplicate action work; old completion cannot release
a newer slot. Composition-confirmation selection is ignored without consuming the row.

The extension uses public `editorInfoField` and owns its `EditorView`; no private
Editor field or active-editor fallback is used. Missing/replaced bindings and
observed detach/destroy fail safely. Activation events are debounced; undelivered
same-task programmatic A→B→A remains an observation limit. Final unchanged binding,
document, source and selection checks still apply. Native template effects already
running remain outside cancellation; no abort/rollback promise is made.

## Temporary Template insertion limitation

**Template insertion through Entities is unavailable during recovery.** Existing
insertion providers keep their action type, template path, trigger, identity and
unknown settings, and remain identifiable in settings and autocomplete. Selecting
one settles once, runs no engine and leaves the trigger, document and selection
unchanged. This applies to every Templater presence/version/capability state.

To insert manually, dismiss autocomplete, remove the trigger text, then run
**Templater: Open insert template modal** and choose the named template, or use
your existing template hotkey. Entities never dispatches that command, clears the
trigger, substitutes another engine or changes insertion into note creation.
The native operation is outside Entities' guard; it is not a claim of safer native
concurrency. Note creation continues through the separate R4a adapter.

Inspected native append writes to a later editor selection. Lower-level rendering
shares mutable modules/configuration and includes with external native runs; an
Entities-only queue cannot establish isolated output. Restoring insertion requires
a reviewed upstream integration with isolated per-run state and a guarded commit,
including properties/cursor/hooks parity. No parser adapter is shipped here.

Focused R4b regressions use real CodeMirror state/view/extension with synthetic
Obsidian events and modal/provider fixtures. Inert extracted native methods verify
transaction and activation boundaries on 1.12.7/1.14.1. Public APIs are declared
at 1.7.2, but the manifest/floor is unchanged and those declarations do not certify
scheduling or mounting behavior. Live desktop/mobile, Source/Live Preview/popout,
rendered links, properties, immediate undo/redo, manual native-command routing and
runtime upgrade acceptance are **NOT RUN**. See the runtime acceptance matrix.
