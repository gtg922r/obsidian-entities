# Settings input suggestions

Settings inputs retain the existing owned suggestion list and Popper positioning.
Each focused input builds one synchronous catalog, then filters that snapshot while
typing. Refocusing refreshes files, folders, tags and frontmatter keys. Empty
results close the popup. File selection includes Markdown files only; folder
selection includes `/`. Paths retain their exact vault-relative text. Dataview
completion replaces only the trailing tag or incomplete quoted folder, including
folders containing spaces. Selection emits one input event from the input's window.

One rendered settings view, provider modal, template modal or nested filter editor
owns its suggestion cleanup. Hide, replacement, close and plugin unload dispose
those resources. An open popup has one keymap scope and one Popper instance;
repeated typing updates that instance. Close is safe before opening, and teardown
removes the input, popup and window listeners, clears catalogs, and unregisters
shorter-lived owners. Cleanup attempts every step and reports failures to the
console without interrupting sibling cleanup or settings drain. Listeners are
removed from the window where they were attached. Popup DOM belongs to the input's
original document; observing adoption into another document retires that input's
suggestions instead of rebinding its popup.

Each provider modal render receives a detached settings draft. Icon and template
buttons capture that render's owner before they can open a child or accept its
result. Retained controls and delayed results therefore cannot contaminate the
current draft's next valid save. R1 still owns canonical settings and
field/collection conflicts, including other live views. No settings schema,
provider retrieval, or editor autocomplete changes.

## Public API migration deferred

The owner deferred `AbstractInputSuggest` adoption after inspecting and executing
unchanged host methods in Obsidian **1.12.7, signed public 1.13.4, and 1.14.1**.
Native `open()` registers a bound document scroll callback with `capture: true`;
`close()` removes it with the default `capture: false`. The callback remains on a
surviving document, retaining its instance and detached input tree. Reopening one
instance adds no extra listener, but each newly opened instance does: independent
probes reproduced 25 additional callbacks after 25 control replacements, and
10/50 retained instances after 10/50 replacements. Never-opened controls do not
have that document root. A destroyed document may itself become collectible.

The [public API](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)
exposes `close()`, but no disposal or input-rebinding operation. These classes are
not Components. Removing the callback requires its unavailable native identity;
clearing a selection callback does not release the input graph. No host prototype,
private field, listener interception, stable-input pooling or parallel native
implementation is shipped. The narrow lint exception and Popper dependency remain
intentional until a corrected public host lifecycle is verified. The manifest
remains version 0.4.4 with minimum Obsidian 1.7.2.

Repository tests cover the actual owned list with simulated DOM and positioning
collaborators. Separate extracted-host and real-Popper probes are method evidence,
not live keyboard/touch/IME, placement, separate settings window, minimum-host or
mobile acceptance. Those remain owner gates.
