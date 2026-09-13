# Release preparation and BRAT candidates

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
notes. It fetches origin and requires exact upstream equality; reconcile divergence
explicitly. It runs `npm ci` and `npm run check`, stopping on any failure, then
`npm version <next-version> --no-git-tag-version`. It never stages, commits, tags,
pushes, dispatches workflows or publishes. Review the five changed files:
`package.json`, `package-lock.json`, `manifest.json`, `versions.json`, `CHANGELOG.md`.
Commit the candidate metadata through review, keeping it off master during beta.

The version lifecycle rejects implicit npm tagging. Direct lifecycle use must also
include `--no-git-tag-version`. npm updates package/lock before the version hook;
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

`release:publish` requires explicit `--prerelease`; stable publication/promotion is
disabled. Publication recomputes the package hashes, verifies the exact allowlist,
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

Stable promotion remains a separate reviewed implementation and owner gate. It
must preserve the tested tag, source, asset IDs and bytes, verify remote receipt
and hashes, and align default-branch release metadata after acceptance without
rebuilding or replacing assets. GitHub's [release creation](https://cli.github.com/manual/gh_release_create),
[asset download API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)
and [release editing](https://cli.github.com/manual/gh_release_edit) define the
underlying publication operations.

## What dry runs establish

All dry runs are observational: no installation, build, source/index/ref writes,
workflow dispatch, tag push or release changes. They still fail on invalid inputs.

| Command | Validated | Planned, not exercised |
| --- | --- | --- |
| Preparation | Local tree/index, cached upstream equality, toolchain, current metadata, next-version notes | Fetch/fresh remote equality, install, checks, metadata writes |
| Packaging | Committed metadata/notes, local tag if present, toolchain, unused destination | Export, install, checks, produced bytes and receipt |
| Publication | Existing package/receipt bytes, source metadata, local and live remote tag, live release-list read | Draft/upload, remote asset verification, visibility change |
