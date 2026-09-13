**Entities recovery status — September 13, 2026**

Coordinator: `01a09705-708c-7ae2-84b6-662669a37952`. Plan: [PROGRAM.md](./PROGRAM.md). Updated: `2026-09-13T20:06:00Z`. Only the coordinator edits this ledger. Accepted master: `02be703df0714eaa5dabbf093215b1da719e9e36` (R0 and program merged); R1 remains under implementation and is not approved.

| Packet | Task | State | Review/merge |
| --- | --- | --- | --- |
| R0 — Reproducible baseline | `01a09c45-eae9-7f30-b9a9-6275277a04ae`; branch `codex/reproducible-development-baseline`; worktree `/Users/ryancash/.codex/worktrees/d268/obsidian-entities` | [PR #30](https://github.com/gtg922r/obsidian-entities/pull/30) merged September 13 at 19:51:40 UTC. Reviewed head `0487c9131b20d0a61b25cd7a33e5dea2b2f3dc64`; resulting master `562a5bddd2f3c0ee59f42c32bd49936cc5d6f1fd`. | `/root/local_work_audit` found no actionable findings; owner verified exact head and [passing CI](https://github.com/gtg922r/obsidian-entities/actions/runs/34778708914). 143 tests; lint/build/watch; full/runtime audit zero. |
| R1 — Settings identity | `01a09c47-db71-7603-aa0b-b960e8525d34`; branch `codex/provider-settings-integrity`; worktree `/Users/ryancash/.codex/worktrees/651a/obsidian-entities` | Provisional [PR #32](https://github.com/gtg922r/obsidian-entities/pull/32), reviewed preliminary head `a56e2240c5428588e231c66f3447d03d5d9f473d`. Worker is addressing independent review findings. | Not approved. Both architecture/persistence and UI/host-boundary reviewers require recheck of the final revised head. |
| R2–R8 | Not dispatched | Wait for accepted predecessor contracts. | No merge/release acceptance yet. |

**Current contracts:** use `providerInstanceId` for configured identity; assign at add/migration, not in static defaults. Canonical settings mutate immediately by ID; persistence is serialized and preserves unknown data. R1 does not modify cache/actions, tooling, the runtime floor, or the settings presentation framework. R0 does not modify runtime contracts, schema, or the runtime floor.

**Intake gap:** these five report files are absent in all searched locations: `project-recovery-plan.md`, `project-recovery-evidence.md`, and the September 12 architecture, hygiene, and ecosystem reports under `docs/audits`. User was asked for their location. Do not claim to have read them; reconcile the full reports when available.

**Preservation:** the saved checkout remains at `8852524` with original historic worktrees/refs and untracked material intact. New task worktrees live outside the vault. No bulk branch cleanup or historical PR closure has been performed. The earlier audit's dependency/test results are baseline evidence, not current acceptance for implementation PRs.

**Evidence ledger:** program architecture/operations reviews completed by `/root/architecture_audit` and `/root/local_work_audit`; corrections incorporated. Program-only [PR #31](https://github.com/gtg922r/obsidian-entities/pull/31) merged after independent approval of `64d3fd8984148c5b9c8511c1f47556de05e58ca3` and passing CI. R0 evidence is recorded in PR #30 and CI run `34778708914`; independent review additionally confirmed unchanged lint coverage/rules for all intended code files, exact runtime engines, and unchanged runtime dependencies.

**R1 blocking review findings:** actual Obsidian 1.12.7 and 1.14.1 host helpers swallow malformed-read/write errors, defeating synthetic rejected-promise tests; concurrent array drafts can revert newer filter edits; delayed predecessor writes can overwrite a re-enabled plugin's newer settings; throwing error reporters can poison retries. Also repair the stale save-error banner and ignore private migration backups. Owner authorized a validated direct adapter boundary, explicit draft conflicts, and minimal per-app/plugin persistence handoff. Add production-boundary and A→B→C lifecycle tests; preserve abrupt-process-exit limitations. No self-review or provisional CI result substitutes for final independent acceptance.

**Archive checkpoint:** private local archive created at `/Users/ryancash/.local/share/obsidian-entities-recovery/2026-09-13T200423Z-6g0uqrff`, outside the vault and public Git. It contains a complete bundle of current refs, 19 untracked/configuration/artifact files from the saved checkout and two historical worktrees, manifests, checksums, and restoration instructions. Bundle SHA-256: `646f19b209292abd457ae426f969abfc09e2eb9a9a1514f94a12451eab3368d8`; private archive SHA-256: `544cdd80cadf03807e0a636f3e9857082e4b5e0aa1d5ab4911298575bb454410`. A disposable mirror restored CLI `db1d9c4` and hidden snapshot `da9593e` with its custom ref; extraction verified every archived file checksum. Active implementation worktree edits and regenerable dependencies are excluded. No references/worktrees deleted. Actual Obsidian rollback remains untested; this preservation snapshot is not release acceptance.

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

**Next actions:** receive revised R1 PR/head with review-fix evidence, then reassign non-author migration/persistence and host/UI reviewers. Accept only the reviewed, validated revision. R2's cache/isolation handoff has been researched and waits for accepted settings identity. Preservation is verified; historical cleanup still requires a current ownership/disposition check. Before release, complete the real-app compatibility/upgrade/rollback gate.
