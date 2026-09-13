# Release preparation, BRAT candidates and stable promotion

Use Node **24.21.0**, npm **11.19.0**, Git and `tar`; publication also needs an
authenticated GitHub CLI with repository write access. Work in an isolated checkout
of `gtg922r/obsidian-entities`, with `origin` pointing to that repository. Do not run
release tooling in an installed plugin or personal vault. Runtime acceptance,
upgrade/rollback checks and BRAT dogfood remain separate recovery gates.

## Prepare reviewable metadata

Start a candidate branch from accepted master, with an up-to-date upstream:

```bash
git fetch origin
git switch -c codex/release-candidate origin/master
npm run release:patch -- --dry-run
npm run release:patch
```

Use `release:minor` or `release:major` for the corresponding bump. Preparation
requires a clean tree/index (including untracked files), aligned package, both
lockfile versions, manifest and minimum-version mapping, and meaningful Unreleased
notes. The manifest must identify `entities`, have a nonempty name and a boolean
`isDesktopOnly`; malformed fields are rejected without repair. It fetches origin
and requires exact upstream equality; reconcile divergence explicitly. It runs `npm ci` and `npm run check`, stopping on any failure, then
`npm version <next-version> --no-git-tag-version`. It never stages, commits, tags,
pushes, dispatches workflows or publishes. Review the five changed files:
`package.json`, `package-lock.json`, `manifest.json`, `versions.json`, `CHANGELOG.md`.
Commit the candidate metadata through review, keeping it off master during beta.

The version lifecycle rejects implicit npm tagging. It recognizes npm 11's
empty-string encoding of an explicitly disabled `git-tag-version` flag. Direct
lifecycle use must also include `--no-git-tag-version`. npm updates package/lock before the version hook;
if a hook or write fails, inspect all five files. The script reports failure and
retains partial edits for deliberate repair. It never resets unrelated work. Once
package/lock agree on the intended version, rerunning the hook through
`npm_package_version=0.4.5 npm_config_git_tag_version=false node version-bump.mjs` can finish interrupted metadata writes;
inspect the result before committing. Do not rerun `release:patch` to recover an
interrupted version change: it calculates another bump and requires a clean tree.

Changelog sections must be unique, with Unreleased first and any link definitions
in a trailing block. Missing/empty notes, duplicate sections/references and
ambiguous structure fail before writes. Preparation preserves released prose and
historic references; when a reference block exists it updates the Unreleased link
and adds the new version link. Rerunning the same changelog version is a no-op only when
that version has notes and Unreleased is empty; later Unreleased work causes a
failure instead of replacing history. Notes can be extracted independently with
`npm run release:notes -- 0.4.5 /tmp/entities-0.4.5-notes.md`.

## Package an exact committed candidate

After the candidate metadata is committed and reviewed, check out that commit:

```bash
npm run release:assets -- 0.4.5 --dry-run
npm run release:assets -- 0.4.5
```

The version must exactly match package/lock/manifest/versions and a nonempty
changelog section. Existing local tags must resolve to HEAD, including annotated
tags; packaging can precede deliberate tag creation. The tool exports only the
committed revision into a disposable directory, installs with `npm ci`, and runs
`npm run check` there. A successful package appears atomically at
`dist/release/0.4.5/`. Existing destinations, including partial packages, are
rejected without deletion. Preserve or deliberately move them aside before retry.

The directory contains `main.js`, the byte-for-byte committed `manifest.json`,
committed `styles.css` if present, `release-notes.md`, and `receipt.json`. The
schema-versioned receipt binds repository, tag, exact source commit, support floor,
toolchain, metadata hashes, notes hash and artifact SHA-256 hashes/sizes. Local
`data.json`, backups, environment files and source maps are never copied. A stale
root `main.js` is ignored. Failed builds never produce a completed candidate.

A receipt records provenance and integrity; it is not a signature or evidence of
runtime acceptance. Retain it with the tested bytes and record its hash in the
owner's acceptance evidence. Do not rebuild after testing and assume matching
version strings mean matching artifacts. Do not edit the package or change its tag
while publishing.

The manual **Prepare Obsidian release candidate** workflow provides the same
packaging for an existing tag, with read-only repository permissions. Its artifact
name includes the tag, source commit and workflow run. Download and extract the
artifact contents into `dist/release/<tag>/` for publication; retain them beyond
Actions' 30-day artifact retention if needed. This workflow never creates releases
and never runs automatically on push/PR. Ordinary CI runs release regression tests.

## Publish only the verified BRAT prerelease

After the owner authorizes the specific candidate, deliberately create and push
its exact numeric tag at the reviewed commit. Those actions are manual and are not
part of any script. Then, with the source commit and local tag available:

```bash
npm run release:publish:brat -- 0.4.5 --dry-run
npm run release:publish:brat -- 0.4.5
```

`release:publish` requires explicit `--prerelease`. Stable promotion uses the
separate `release:promote` command after owner acceptance. Publication recomputes the package hashes, verifies the exact allowlist,
compares metadata/notes to the receipt's committed source, and compares both local
and peeled remote tag commits to that source. HEAD can have advanced. The target
is always `github.com/gtg922r/obsidian-entities`; an existing release or draft blocks
a rerun instead of replacing or appending assets.

Publication takes a verified local snapshot, creates a draft with the allowlisted
plugin files and receipt, then downloads each GitHub asset by ID and verifies its
bytes. It rechecks draft identity, asset IDs and remote tag before making that same
draft visible with `--prerelease --latest=false`. It never rebuilds, creates/pushes
tags, dispatches workflows or promotes stable. On failure or an uncertain API
result, inspect the remote draft/release; there is no automatic cleanup, clobber or
retry. A failed final status change may already have taken effect.

Pin the exact numeric tag for initial BRAT dogfood. BRAT 1.1+ uses release assets;
unpinned installs may advance to a higher prerelease. Keeping candidate metadata
off the default branch protects ordinary Obsidian update discovery; BRAT does not
require candidate metadata on master. See the [BRAT developer guide](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md)
and [Obsidian release requirements](https://github.com/obsidianmd/obsidian-releases/blob/master/README.md).

## Promote the accepted candidate without rebuilding

`release:promote` changes the existing GitHub release into the latest stable
release. It preserves its numeric tag, raw tag object, exact source commit,
release ID, asset IDs and bytes, release title/body and target. It never builds,
installs, uploads/replaces/deletes assets, creates a release, retags, updates Git
refs, merges metadata or dispatches a workflow. Ordinary publication still
requires `--prerelease`; it cannot implicitly promote a candidate.

**Runtime acceptance remains a human owner gate.** No recovery candidate has been
accepted by adding this command. Minimum/current desktop, mobile, integrations,
upgrade/rollback and pinned BRAT dogfood must be completed against the retained
package before the owner authorizes promotion. A receipt proves consistency, not
testing, approval or authorship.

### Reviewed metadata transition and evidence

1. Keep the candidate's numeric metadata off the default branch throughout
   dogfood. Retain its package, receipt hash, raw tag object SHA (for an annotated
   tag, distinct from the peeled source SHA), and GitHub release/asset IDs.
2. Complete owner-reviewed runtime acceptance material describing what was run,
   results and limitations, the tested tag/source/receipt/assets, and the owner's
   approval of that candidate. Commit the Markdown report through review.
3. In the owner-controlled promotion window, merge the candidate branch into the
   default branch preserving the tested commit's ancestry. A normal merge (or a
   fast-forward preserving the same commit) works; squash/cherry-pick alone does
   not. The recorded transition commit must descend from the candidate and have
   **all five** metadata files byte-identical to the receipt's source:
   `package.json`, `package-lock.json`, `manifest.json`, `versions.json`, and
   `CHANGELOG.md`. Review conflict resolutions explicitly. The command does not
   perform this transition.
4. Commit a versioned acceptance index using the shape below. Record the exact
   metadata transition commit and report commit/path/hash. Merge the index through
   review while preserving its commit. Both the transition and report commits
   must be ancestors of the index commit; the index must be an ancestor of the
   observed default-branch HEAD. The default branch must still contain the exact
   pinned index bytes at that path. This rejects a superseded index.
5. Deliberately fetch the required commits and tag into the isolated checkout
   before invoking promotion; missing objects fail without fetching. Retain the
   original local package at `dist/release/<tag>/`. Run the dry run, inspect its
   pinned identities, then invoke promotion only with the owner's authorization.

The schematic index below uses placeholder hashes/IDs; it is **not an acceptance
record** and cannot pass validation. Use actual values, with one entry for every
uploaded asset. `styles.css` is included only when present in the candidate;
`receipt.json` is required; `release-notes.md` is local evidence and is not an
uploaded asset. The command downloads the committed index and report from the
fixed repository at their exact commits and compares them to local Git objects.

```json
{
  "schemaVersion": 1,
  "repository": "gtg922r/obsidian-entities",
  "tag": "0.4.5",
  "sourceCommit": "TESTED_SOURCE_40_HEX",
  "tagObject": "TESTED_RAW_TAG_OBJECT_40_HEX",
  "releaseId": 42,
  "receiptSha256": "EXACT_UPLOADED_RECEIPT_64_HEX",
  "minAppVersion": "1.7.2",
  "metadataCommit": "REVIEWED_METADATA_TRANSITION_40_HEX",
  "assets": {
    "main.js": { "id": 100, "size": 123, "sha256": "TESTED_BYTES_64_HEX" },
    "manifest.json": { "id": 101, "size": 123, "sha256": "TESTED_BYTES_64_HEX" },
    "styles.css": { "id": 102, "size": 123, "sha256": "TESTED_BYTES_64_HEX" },
    "receipt.json": { "id": 103, "size": 123, "sha256": "EXACT_UPLOADED_RECEIPT_64_HEX" }
  },
  "review": {
    "commit": "OWNER_REVIEWED_REPORT_40_HEX",
    "path": "docs/recovery/acceptance/0.4.5.md",
    "sha256": "REPORT_BYTES_64_HEX"
  }
}
```

The record is an immutable evidence index, not a signature or a JSON approval
boolean. Tooling verifies its candidate bindings, references, hashes and ancestry.
The owner remains responsible for checking that the referenced report actually
covers and approves that candidate; the tool does not interpret its prose or
verify who approved it. Unknown schema fields are rejected.

```bash
npm run release:promote -- 0.4.5 --acceptance <40-hex-index-commit>:docs/recovery/acceptance/0.4.5.json --dry-run
npm run release:promote -- 0.4.5 --acceptance <40-hex-index-commit>:docs/recovery/acceptance/0.4.5.json
```

Use the actual 40-character hash in place of `<40-hex-index-commit>`. Both the
recorded transition and current default HEAD are checked separately against all
five metadata hashes, including remotely downloaded metadata at those immutable
commits. Newer code can already exist on the default branch; it cannot enter the
release because promotion never builds and only addresses the original tested
release/assets. Changes to any of the five metadata files block promotion until
explicitly reconciled through review, or a new candidate is tested. Version and
support floor remain `0.4.4` and `1.7.2` in this implementation; examples do not
bump them or establish a new floor.

### Remote verification and failure recovery

Promotion requires exactly one existing, published prerelease with the recorded
positive release ID and `draft=false`, `prerelease=true`. It checks full paginated
release and asset inventories, rejecting missing/extra/duplicate assets or IDs,
incomplete assets and mismatched sizes/digests. It compares the release body to
the receipt's exact source notes, downloads **every asset by ID, including the
remote receipt**, and compares every byte to the retained package and acceptance
hashes. A local receipt alone is insufficient. It checks both raw and peeled local
and remote tag IDs and pins the observed default branch name/HEAD.

A higher/equal numeric stable version, or a stable release with a publication
timestamp at or after the candidate's, blocks stale promotion. Unorderable stable
tags or malformed timestamps also fail closed. All pages are inspected; the
first stable release works with no existing latest release. Preflight establishes
that case from a successful complete release list, without treating an API error
as absence or requiring `/releases/latest` to exist. Publication timestamps expose
what GitHub reports; they do not provide a history of earlier promotion edits.

After a second download and fresh inventory/ref rechecks, the sole mutation is
`PATCH /repos/gtg922r/obsidian-entities/releases/<recorded-id>` with exactly
`{"prerelease":false,"make_latest":"true"}`. There is no tag, target, draft, body or
asset field in that request. The command rechecks inventories/refs, downloads the
same asset IDs again, verifies the stable status and unchanged release identity,
and requires `/releases/latest` to identify this candidate. It never retries a
mutation. A failed PATCH response or any failed postcheck reports an **uncertain
outcome**, because the change may already have succeeded. Inspect release ID,
latest, tag, default branch and remote bytes manually before taking further action.
An already-stable release is rejected on rerun; there is no automatic rollback,
cleanup, replacement or second publication.

GitHub documents [release updates by ID](https://docs.github.com/en/rest/releases/releases#update-a-release),
[asset downloads by ID](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)
and [immutable commit content reads](https://docs.github.com/en/rest/repos/contents#get-repository-content).
Its [conditional-request guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests)
describes conditional GETs, not an atomic release/assets/refs precondition. The
command's rechecks detect observable races but cannot prevent changes after the
last read, an intervening change that is reverted, or a lost mutation response.
Serialize release writers administratively during the promotion window.

The default-branch metadata merge enables ordinary Obsidian update discovery
before the release PATCH. It therefore belongs **after acceptance** and in that
same controlled window. GitHub does not provide an atomic transaction spanning
this merge and release visibility. This tooling does not claim to eliminate that
window or silently repair it after a failure.

## What dry runs establish

All dry runs are observational: no installation, build, source/index/ref writes,
workflow dispatch, tag push or release changes. They still fail on invalid inputs.

| Command | Validated | Planned, not exercised |
| --- | --- | --- |
| Preparation | Local tree/index, cached upstream equality, toolchain, current metadata, next-version notes | Fetch/fresh remote equality, install, checks, metadata writes |
| Packaging | Committed metadata/notes, local tag if present, toolchain, unused destination | Export, install, checks, produced bytes and receipt |
| Publication | Existing package/receipt bytes, source metadata, local and live remote tag, live release-list read | Draft/upload, remote asset verification, visibility change |
| Promotion | Retained package, committed acceptance/report, recorded and current default metadata, tag objects/source, paginated release/assets, downloaded remote receipt and bytes, stale-stable guard and repeated remote reads | One release-ID PATCH, stable/latest verification and post-PATCH downloads |
