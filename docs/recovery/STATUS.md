**Entities recovery status — September 13, 2026**

Coordinator: `01a09705-708c-7ae2-84b6-662669a37952`. Plan: [PROGRAM.md](./PROGRAM.md). Updated: `2026-09-13T19:46:09Z`. Only the coordinator edits this ledger. Accepted implementation baseline: `098702d17d4e7c0209020d4e89c7fbef128ceb90`; no recovery implementation merged yet.

| Packet | Task | State | Review/merge |
| --- | --- | --- | --- |
| R0 — Reproducible baseline | `01a09c45-eae9-7f30-b9a9-6275277a04ae`; branch `codex/reproducible-development-baseline`; worktree `/Users/ryancash/.codex/worktrees/d268/obsidian-entities` | [PR #30](https://github.com/gtg922r/obsidian-entities/pull/30) ready, head `0487c9131b20d0a61b25cd7a33e5dea2b2f3dc64`, base `098702d`. Worker reports 143 tests, lint/build/watch, full/runtime audit zero. | Independent reviewer `/root/local_work_audit` assigned; coordinator acceptance pending. [CI passed](https://github.com/gtg922r/obsidian-entities/actions/runs/34778708914). |
| R1 — Settings identity | `01a09c47-db71-7603-aa0b-b960e8525d34`; branch `codex/provider-settings-integrity`; worktree `/Users/ryancash/.codex/worktrees/651a/obsidian-entities` | Implementation active; freshly fetched base `098702d`; scope confirmed with owner. | PR pending; independent migration/persistence review required after R0 integration. |
| R2–R8 | Not dispatched | Wait for accepted predecessor contracts. | No merge/release acceptance yet. |

**Current contracts:** use `providerInstanceId` for configured identity; assign at add/migration, not in static defaults. Canonical settings mutate immediately by ID; persistence is serialized and preserves unknown data. R1 does not modify cache/actions, tooling, the runtime floor, or the settings presentation framework. R0 does not modify runtime contracts, schema, or the runtime floor.

**Intake gap:** these five report files are absent in all searched locations: `project-recovery-plan.md`, `project-recovery-evidence.md`, and the September 12 architecture, hygiene, and ecosystem reports under `docs/audits`. User was asked for their location. Do not claim to have read them; reconcile the full reports when available.

**Preservation:** the saved checkout remains at `8852524` with original historic worktrees/refs and untracked material intact. New task worktrees live outside the vault. No bulk branch cleanup or historical PR closure has been performed. The earlier audit's dependency/test results are baseline evidence, not current acceptance for implementation PRs.

**Evidence ledger:** program architecture/operations reviews completed by `/root/architecture_audit` and `/root/local_work_audit`; corrections incorporated. R0 implementation evidence is recorded in PR #30 and CI run `34778708914`; independent review and resulting master SHA are pending. R1 PR/head/evidence are pending. Neither implementation is approved for merge yet. R0 must merge before final R1 base/toolchain validation.

**Archive checkpoint:** Git bundle and untracked/private configuration archive not yet created; backup path/checksum and disposable restoration verification not performed. No ref/worktree deletion until these fields are populated. Real-vault artifact/data backup and rollback test also not performed.

| Legacy item | Evidence/replacement | Closure/deletion |
| --- | --- | --- |
| Issue #12 | Filename already fixed; record original fix reference before closure. | Open; unchanged. |
| PR #19 | Folder-setting behavior already merged separately (#20); validate destination semantics in R4. | Open; unchanged. |
| PR #10 / alias branch `236490d` | Preserve issue #9; replace implementation in R5. | Open; unchanged; feature not marked fixed. |
| PR #11 / Templater branch `65a543c` | Signature diagnosis obsolete; keep destination/outcome cases in R4. | Open; unchanged. |
| PR #14/#15 | Retire after remaining behavioral issues are represented in R4/R5. | Open; unchanged. |
| PR #27 / CLI `db1d9c4` | Preserve; R8 is replacement work after recovery release. | Open; unchanged. |
| Periodic worktrees/refs `4a73530`, `26b317d` | #28 merged; corrected tree matches master. Preserve before retirement. | Intact. |
| Snapshot `da9593e` | Unique May 19 plan; include in verified bundle. | Intact. |

**Next actions:** complete independent review of this program; receive R0/R1 PRs with exact head SHAs; assign non-author reviewers; return findings to each implementation task; accept only reviewed, validated revisions. Then dispatch R2 against accepted settings identity. Before archival cleanup, preserve a Git bundle and untracked archive with restoration instructions. Before release, complete the real-app compatibility/upgrade gate.
