# Development Guide

This document describes the **Entities** plugin development workflow, including
versioning, changelog management and publishing **production** and **beta**
releases that work nicely with Obsidian core as well as the BRAT tester.

---

## 1. Terminology

* **Prod release** – a stable version meant for the general public.
* **Beta release** – a pre-release for early testers (via BRAT).
* **`main`** – the default branch where normal development happens.
* **Release PR** – an automatically generated pull-request created by
  `release-please` that bumps versions and updates the CHANGELOG.

---

## 2. Prerequisites

1. Node ≥ 16
2. GitHub CLI or Git credentials with push rights
3. Export `GITHUB_TOKEN` in your shell (for local execution of
   release-please)
   ```bash
   export GITHUB_TOKEN="<a-token-with-repo-scope>"
   ```

Install project dependencies once:
```bash
npm install
```

---

## 3. Everyday Development

1. Use **conventional commit** messages (`feat: …`, `fix: …`, `docs: …`, …).
   Release-please parses them to determine the next semantic version and to
   group entries in the changelog.
2. Keep the CHANGELOG untouched – it is generated for you.
3. Open a normal PR against `main` and merge it once approved.

---

## 4. Cutting a New Release

There are two supported flows: **automatic (recommended)** and **manual**.

### 4.1 Automatic (recommended)

On every push to `main` the **Release Please** workflow runs and will either:
* Detect that a Release PR already exists and do nothing, _or_
* Create / update **one** Release PR (labelled `autorelease: pending`).

Merging the Release PR triggers:
1. A git tag `x.y.z`.
2. A GitHub Release marked **draft=false** (for prod) or **prerelease=true**
   (for beta – see below).
3. The *Build obsidian plugin* workflow, which zips the plugin and uploads the
   assets `manifest.json`, `main.js`, `styles.css` and `<plugin>.zip` to the
   release.

That’s it – users will now receive the update automatically 💫.

### 4.2 Manual (only if needed)

If you prefer, you can run release-please locally:

```bash
# Create / update release PR
npm run release:pr

# (review → squash-merge)

# Publish the release (creates tag & changelog section)
npm run release:github
```

---

## 5. Beta Releases with BRAT

1. Checkout a branch off `main`, e.g. `beta/1.2.0-preview.1`.
2. Bump the version **manually** to a pre-release tag (`1.2.0-preview.1`):
   ```bash
   npm version prerelease --preid=preview
   git push --follow-tags
   ```
3. Wait for the *Build obsidian plugin* workflow to finish – it will attach the
   assets to a **prerelease** on GitHub.
4. Tell your testers to add the repository to BRAT and install the pre-release.

> **Important:** Obsidian will **not** pick up `1.2.0` once users have
> `1.2.0-preview.n` installed. The next public version has to be **1.2.1** or
> higher. This quirk is documented in the table in the BRAT docs.

---

## 6. Maintaining `manifest.json` & `versions.json`

`manifest.json` must always contain the current plugin version.  A short helper
script (`version-bump.mjs`) keeps `manifest.json` and `versions.json` in sync
with `package.json`.  The script is executed automatically by release-please via
the extra-files configuration, so you rarely have to run it manually.

If you do need to update it yourself:
```bash
node version-bump.mjs && git add manifest.json versions.json
```

---

## 7. Handy npm Scripts

* `npm run dev` – incremental rebuild during development
* `npm run build` – verify type-checks & produce production bundle
* `npm run test` – jest test-suite
* `npm run changelog` – regenerate `CHANGELOG.md` without opening a PR
* `npm run release:pr` – open / update release PR (local)
* `npm run release:github` – publish release to GitHub (local)

Happy hacking! 🧑‍💻