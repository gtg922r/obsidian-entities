# Entities recovery: the plan

**Rehabilitate the plugin around a simple promise: find, link and create the right
entity without leaving the sentence.** Keep configurable providers and fast,
synchronous autocomplete. Spend architectural effort where mistakes can lose
settings, link the wrong note or overwrite writing; avoid a rewrite.

| Phase | Outcome and exit criterion | State |
| --- | --- | --- |
| 1. Establish a trustworthy baseline | Preserve valuable work, reconcile obsolete PRs, reproduce lint/tests/build, and keep one roadmap. | Baseline and preservation work completed. |
| 2. Restore correctness | Stable provider IDs and lossless settings; independent caches; real link targets; truthful creation results; guarded editor insertion; predictable triggers, aliases and filters. | Core repairs merged. Date routing corrections remain under review. |
| 3. Modernize the Obsidian boundary | Clean input lifetimes; searchable native settings; safe external-settings reconciliation; tested daily/weekly integrations and a verified minimum host. | Input lifecycle merged. Native settings and the proposed Obsidian 1.13.4 minimum still require compatibility validation. |
| 4. Prove and ship 0.5 | Measured autocomplete improvements; exact artifacts; upgrade/rollback; minimum/current desktop, popout and mobile checks; representative BRAT writing sessions; promote the tested assets unchanged. | Release tooling is merged. Performance work is active. Runtime and dogfood gates remain open; no recovery release has shipped. |
| 5. Expand creation deliberately | Salvage the valuable CLI work onto the reviewed creation service, with stable target IDs and useful discovery/errors. | After the recovery release. |

Keep Dataview and existing configurations. Treat optional integrations as
capabilities that may appear or disappear, and explain unavailable behavior.
A completed native creation and a safe final editor insertion are separate facts.
Templater insertion remains unavailable through Entities until its shared native
state can be isolated; the user's manual native command remains a separate option.

The existing input popup remains while the public native replacement has a
verified cleanup defect. Modernization must preserve correct behavior, including
settings drafts, window ownership and keyboard composition. Core Daily Notes and
older Periodic Notes support follow current-route date repairs as a separate change.

Significant changes use isolated tasks and PRs. Independent reviewers reproduce
failures and review the exact revision; the owner resolves product and architecture
tradeoffs, requires corrections, verifies CI, and merges. Native-method probes
supplement actual-app testing, never replace it. Deleting old branches or achieving
a test count is not the definition of recovery.

**Next:** finish the date corrections, measure the allocation change, establish the
minimum/current test hosts, then complete native settings and external reloads.
No release is accepted with known settings loss, wrong targets, stale editor writes
or false creation success. MIT is now the consistent project license.

Current public milestones: [settings integrity](https://github.com/gtg922r/obsidian-entities/pull/32),
[provider caches](https://github.com/gtg922r/obsidian-entities/pull/35),
[link targets](https://github.com/gtg922r/obsidian-entities/pull/39),
[guarded actions](https://github.com/gtg922r/obsidian-entities/pull/46),
[trigger context](https://github.com/gtg922r/obsidian-entities/pull/49),
[file sources and aliases](https://github.com/gtg922r/obsidian-entities/pull/51),
[input lifecycle](https://github.com/gtg922r/obsidian-entities/pull/54), and
[date repairs under review](https://github.com/gtg922r/obsidian-entities/pull/55).
The detailed execution ledger is maintained locally; historical checkpoints in
this directory are dated snapshots. This overview does not certify release readiness.
