# Modern Lint And BRAT Release Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt Obsidian's official ESLint plugin and modernize releases so beta testing uses GitHub release assets instead of `manifest-beta.json`.

**Architecture:** Keep `master` as the stable source of truth and make GitHub releases the install surface for both stable Obsidian users and BRAT beta users. Tags are always production-shaped exact semver such as `1.9.10`; beta-versus-production is a GitHub Release flag, not part of the tag name. Linting should use ESLint v9 flat config, scope Obsidian-specific rules to plugin/runtime files, and keep Node release scripts linted under a Node profile.

**Tech Stack:** TypeScript, Obsidian API, ESLint v9 flat config, `eslint-plugin-obsidianmd`, Jest, esbuild, GitHub Actions, GitHub Releases, BRAT.

---

## Current Findings

- `eslint-plugin-obsidianmd` is not installed in `package.json`.
- The repo still has legacy `.eslintrc` and `.eslintignore` files.
- The repo has both `package-lock.json` and `pnpm-lock.yaml`; release scripts and GitHub Actions currently use npm.
- `.github/workflows/release.yml` builds from tags and uploads `main.js`, `manifest.json`, and `styles.css`, which aligns with BRAT's modern GitHub-release-based install flow.
- Current release automation marks every release as `prerelease: true`, including stable tags.
- BRAT no longer needs `manifest-beta.json`; beta releases can use a normal semver tag such as `1.9.10` and a GitHub Release marked as prerelease. Because the tag does not encode prerelease status, the release workflow must receive that status explicitly.

## File Structure

- Modify `package.json`: add lint scripts, install modern lint dependencies, remove legacy TypeScript ESLint v5 packages if replaced by `typescript-eslint`.
- Modify `package-lock.json`: reflect npm dependency changes.
- Create `eslint.config.mjs`: flat ESLint config with Obsidian rules for plugin files and Node rules for scripts/config.
- Delete `.eslintrc`: replaced by flat config.
- Delete `.eslintignore`: replaced by `globalIgnores()` inside flat config.
- Create `.github/workflows/ci.yml`: run lint, tests, and build on pull requests and pushes.
- Modify `.github/workflows/release.yml`: publish release assets from an explicit exact-semver tag and explicit prerelease flag.
- Modify `scripts/release.mjs`: stable releases only; keep version/changelog/manifest/versions flow and push production-shaped semver tags.
- Create `scripts/prepare-release-assets.mjs`: build `dist/release/` assets and patch the release asset manifest version from the exact-semver tag.
- Optionally create `scripts/publish-release.mjs`: dispatch the release workflow for an existing tag with `--prerelease` or stable mode.
- Modify `CHANGELOG.md`: document the release flow change under `Unreleased`.
- Modify `README.md` or `DEVELOPMENT.md`: document stable and BRAT beta release commands.

---

### Task 1: Normalize Package Manager And Lint Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Decide package manager**

Keep npm for this repo unless there is a strong reason to convert the release scripts. The existing scripts call `npm`, GitHub Actions call `npm`, and Obsidian's sample plugin remains npm-friendly.

- [ ] **Step 2: Remove pnpm lock if choosing npm**

Run:

```bash
git rm pnpm-lock.yaml pnpm-workspace.yaml
```

Expected: both files are staged for deletion.

- [ ] **Step 3: Install lint dependencies**

Run:

```bash
npm install --save-dev eslint@^9 @eslint/js typescript-eslint globals eslint-plugin-obsidianmd typescript@^5.8.3
```

Expected: `package.json` and `package-lock.json` update.

- [ ] **Step 4: Remove legacy TypeScript ESLint v5 packages**

Run:

```bash
npm uninstall @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

Expected: the legacy packages disappear from `devDependencies`.

- [ ] **Step 5: Add lint scripts**

In `package.json`, set scripts to include:

```json
{
	"lint": "eslint .",
	"lint:fix": "eslint . --fix",
	"check": "npm run lint && npm test && npm run build",
	"release:check": "npm run check"
}
```

Keep the existing `dev`, `build`, `version`, `test`, and `release:*` scripts unless a later task explicitly replaces them.

- [ ] **Step 6: Verify dependency graph**

Run:

```bash
npm install
npm ls eslint eslint-plugin-obsidianmd typescript-eslint typescript
```

Expected: one ESLint v9 tree, `eslint-plugin-obsidianmd` installed, and no `@typescript-eslint/*` v5 packages.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json package-lock.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "chore: install modern eslint tooling"
```

---

### Task 2: Replace Legacy ESLint Config With Flat Config

**Files:**
- Create: `eslint.config.mjs`
- Delete: `.eslintrc`
- Delete: `.eslintignore`

- [ ] **Step 1: Create flat config**

Create `eslint.config.mjs`:

```js
import js from "@eslint/js";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
	js.configs.recommended,
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts", "manifest.json"],
		languageOptions: {
			globals: {
				...globals.browser
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.mjs", "manifest.json"]
				},
				tsconfigRootDir: rootDir,
				extraFileExtensions: [".json"]
			}
		},
		rules: {
			"obsidianmd/sample-names": "off"
		}
	},
	{
		files: ["*.mjs", "scripts/**/*.mjs", "jest.config.js"],
		languageOptions: {
			globals: {
				...globals.node
			}
		},
		rules: {
			"obsidianmd/no-nodejs-modules": "off"
		}
	},
	globalIgnores([
		"node_modules/",
		"main.js",
		"dist/",
		"coverage/",
		"docs/",
		"versions.json"
	])
);
```

- [ ] **Step 2: Remove legacy config files**

Run:

```bash
git rm .eslintrc .eslintignore
```

Expected: legacy config is removed from the index.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: lint runs and reports real project findings, not config load failures.

- [ ] **Step 4: Fix mechanical lint findings**

Run:

```bash
npm run lint:fix
npm run lint
```

Expected: autofixable issues are fixed, remaining findings are only intentional code changes.

- [ ] **Step 5: Commit**

Run:

```bash
git add eslint.config.mjs .eslintrc .eslintignore package.json package-lock.json src scripts manifest.json
git commit -m "chore: migrate to eslint flat config"
```

---

### Task 3: Address Obsidian-Specific Lint Findings

**Files:**
- Modify: files reported by `npm run lint`
- Test: `tests/**/*.test.ts`

- [ ] **Step 1: Capture baseline**

Run:

```bash
npm run lint
```

Expected: a finite list of Obsidian-specific findings such as deprecated APIs, direct DOM style assignment, unsupported APIs for `minAppVersion`, unsafe deletes, or popout-window compatibility warnings.

- [ ] **Step 2: Fix source findings one category at a time**

For each rule category, make the smallest source change and rerun:

```bash
npm run lint
npm test
```

Expected: lint findings decrease and tests continue passing.

- [ ] **Step 3: Update tests when behavior changes**

If a lint fix changes observable behavior, add or update a Jest test in the closest existing test file, then run:

```bash
npm test -- --runInBand
```

Expected: the changed behavior is covered.

- [ ] **Step 4: Keep rule suppressions explicit**

If a rule must be suppressed, use a one-line ESLint disable with the rule name and a concrete reason:

```ts
// eslint-disable-next-line obsidianmd/no-unsupported-api -- This API is guarded by minAppVersion before use.
```

Expected: no broad file-level disables.

- [ ] **Step 5: Commit**

Run:

```bash
git add src tests eslint.config.mjs
git commit -m "fix: satisfy obsidian lint rules"
```

---

### Task 4: Add CI For Lint, Test, And Build

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - master

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --runInBand
      - run: npm run build
```

- [ ] **Step 2: Verify locally**

Run:

```bash
npm run check
```

Expected: lint, tests, and build pass locally.

- [ ] **Step 3: Commit**

Run:

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: add lint test build workflow"
```

---

### Task 5: Generate Release Assets From Tags

**Files:**
- Create: `scripts/prepare-release-assets.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create release asset script**

Create `scripts/prepare-release-assets.mjs`:

```js
#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const rawTag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME ?? process.argv[2];

if (!rawTag) {
	throw new Error("Usage: node scripts/prepare-release-assets.mjs <tag>");
}

const version = rawTag.trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
	throw new Error(`Release tag must be exact semver like 1.9.10. Received: ${rawTag}`);
}

const releaseDir = "dist/release";

execSync("npm run build", { stdio: "inherit" });

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = version;

writeFileSync(join(releaseDir, "manifest.json"), JSON.stringify(manifest, null, "\t") + "\n");
copyFileSync("main.js", join(releaseDir, "main.js"));
copyFileSync("styles.css", join(releaseDir, "styles.css"));
```

- [ ] **Step 2: Add asset script**

In `package.json`, add:

```json
{
	"release:assets": "node scripts/prepare-release-assets.mjs"
}
```

- [ ] **Step 3: Verify stable asset generation**

Run:

```bash
npm run release:assets -- 0.4.5
node -e "console.log(require('./dist/release/manifest.json').version)"
```

Expected: `0.4.5`.

- [ ] **Step 4: Verify BRAT prerelease asset generation**

Run:

```bash
npm run release:assets -- 0.4.6
node -e "console.log(require('./dist/release/manifest.json').version)"
```

Expected: `0.4.6`. BRAT beta status comes from the GitHub Release prerelease flag, not from the manifest version or tag name.

- [ ] **Step 5: Commit**

Run:

```bash
git add scripts/prepare-release-assets.mjs package.json
git commit -m "chore: generate release assets from tags"
```

---

### Task 6: Modernize GitHub Release Workflow

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Replace legacy release actions**

Update `.github/workflows/release.yml` so a release is published from an explicit exact-semver tag and an explicit prerelease flag. Do not infer prerelease status from the tag name because all tags are production-shaped:

```yaml
name: Release Obsidian plugin

on:
  workflow_dispatch:
    inputs:
      tag:
        description: "Exact semver tag to publish, such as 1.9.10"
        required: true
        type: string
      prerelease:
        description: "Mark the GitHub Release as a prerelease for BRAT"
        required: true
        default: false
        type: boolean

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.tag }}
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - name: Validate tag shape
        run: |
          if [[ ! "${{ inputs.tag }}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "Release tag must be exact semver like 1.9.10"
            exit 1
          fi
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --runInBand
      - run: npm run release:assets -- ${{ inputs.tag }}
      - uses: softprops/action-gh-release@v2
        with:
          name: ${{ inputs.tag }}
          tag_name: ${{ inputs.tag }}
          prerelease: ${{ inputs.prerelease }}
          generate_release_notes: true
          files: |
            dist/release/main.js
            dist/release/manifest.json
            dist/release/styles.css
```

- [ ] **Step 2: Verify workflow semantics**

Check:

```bash
grep -n "prerelease" .github/workflows/release.yml
grep -n "dist/release/manifest.json" .github/workflows/release.yml
```

Expected: prerelease is supplied by `workflow_dispatch`, the tag validator accepts `1.9.10`, and the uploaded manifest comes from `dist/release`.

- [ ] **Step 3: Commit**

Run:

```bash
git add .github/workflows/release.yml
git commit -m "ci: modernize github release workflow"
```

---

### Task 7: Add Optional Release Workflow Dispatcher

**Files:**
- Create: `scripts/publish-release.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create release dispatch script**

Create `scripts/publish-release.mjs`:

```js
#!/usr/bin/env node
import { execSync } from "node:child_process";

function run(command) {
	process.stdout.write(`$ ${command}\n`);
	return execSync(command, { stdio: "inherit" });
}

function output(command) {
	return execSync(command, { encoding: "utf8" }).trim();
}

function fail(message) {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

const args = process.argv.slice(2);
const tag = args.find((arg) => !arg.startsWith("--"));
const prerelease = args.includes("--prerelease");

if (!tag || !/^\d+\.\d+\.\d+$/.test(tag)) {
	fail("Usage: node scripts/publish-release.mjs <1.9.10> [--prerelease]");
}

const localTag = output(`git tag --list "${tag}"`);
if (!localTag) {
	fail(`Tag ${tag} does not exist locally. Create and push the production-shaped tag first.`);
}

run(`git push origin ${tag}`);
run(`gh workflow run release.yml --ref master -f tag=${tag} -f prerelease=${prerelease ? "true" : "false"}`);

process.stdout.write(
	`Requested ${prerelease ? "BRAT prerelease" : "stable release"} publication for ${tag}.\n`
);
```

- [ ] **Step 2: Add publish scripts**

In `package.json`, add:

```json
{
	"release:publish": "node scripts/publish-release.mjs",
	"release:publish:brat": "node scripts/publish-release.mjs --prerelease"
}
```

- [ ] **Step 3: Verify BRAT prerelease behavior manually**

Run:

```bash
npm run check
node scripts/prepare-release-assets.mjs 0.4.5
```

Expected: release assets build with manifest version `0.4.5` and no `manifest-beta.json` is created. When publishing for BRAT, the release is marked prerelease by GitHub Release metadata.

- [ ] **Step 4: Commit**

Run:

```bash
git add scripts/publish-release.mjs package.json
git commit -m "chore: add explicit release publisher"
```

---

### Task 8: Tighten Stable Release Script

**Files:**
- Modify: `scripts/release.mjs`
- Modify: `package.json`

- [ ] **Step 1: Keep stable releases stable-only**

Ensure `scripts/release.mjs` only accepts `patch`, `minor`, and `major`, keeps the working tree clean check, runs `npm run check`, updates `manifest.json`, `versions.json`, `package.json`, and `CHANGELOG.md`, creates a stable exact-semver tag such as `1.9.10`, pushes the commit plus tag, and then dispatches the release workflow with `prerelease=false`.

- [ ] **Step 2: Use production-shaped tags consistently**

Set npm's project-local tag prefix to an empty string:

```bash
npm config set tag-version-prefix "" --location=project
```

Expected `.npmrc` content:

```ini
tag-version-prefix=
```

Expected: stable tags use `0.4.5`, matching the workflow's exact-semver validation.

- [ ] **Step 3: Keep release assets tag-derived**

Do not make `scripts/release.mjs` create `manifest-beta.json`. Stable release assets will be generated by GitHub Actions from the stable-shaped tag. BRAT prereleases use the same tag shape and differ only by GitHub Release prerelease metadata.

- [ ] **Step 4: Commit**

Run:

```bash
git add scripts/release.mjs package.json .npmrc
git commit -m "chore: tighten stable release script"
```

---

### Task 9: Document Modern BRAT Usage

**Files:**
- Modify: `DEVELOPMENT.md` or `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Document beta release flow**

Add a section:

```markdown
## Beta Testing With BRAT

BRAT installs beta builds from GitHub releases. This repository does not use `manifest-beta.json`.

To publish a beta:

```bash
git tag 0.4.5
git push origin 0.4.5
npm run release:publish:brat -- 0.4.5
```

The tag is production-shaped even for BRAT. GitHub Actions builds the plugin and uploads `main.js`, `manifest.json`, and `styles.css` as release assets. The uploaded `manifest.json` gets its version from the tag. The GitHub Release prerelease flag is what makes it a BRAT beta.

GitHub allows one release per tag. To promote a BRAT prerelease, edit that same GitHub Release and clear the prerelease flag, or create a new semver tag for a new build.
```

- [ ] **Step 2: Document stable release flow**

Add:

```markdown
## Stable Releases

To publish a stable release:

```bash
npm run release:patch
npm run release:minor
npm run release:major
```

Stable releases update `package.json`, `manifest.json`, `versions.json`, and `CHANGELOG.md`, create an exact semver tag such as `0.4.5`, and let GitHub Actions publish release assets with `prerelease=false`.
```

- [ ] **Step 3: Update changelog**

Under `CHANGELOG.md` `## [Unreleased]`, add:

```markdown
### Changed
- Adopted Obsidian's official ESLint plugin and modern GitHub-release-based BRAT beta testing.
```

- [ ] **Step 4: Commit**

Run:

```bash
git add README.md DEVELOPMENT.md CHANGELOG.md
git commit -m "docs: document lint and release workflow"
```

---

### Task 10: Final Verification

**Files:**
- Verify all changed files

- [ ] **Step 1: Run full local check**

Run:

```bash
npm run check
```

Expected: lint, tests, and build pass.

- [ ] **Step 2: Verify release asset versions**

Run:

```bash
npm run release:assets -- 9.9.9-beta.0
```

Expected: fails because prerelease-shaped tags are intentionally unsupported.

Run:

```bash
npm run release:assets -- 9.9.9
node -e "const m=require('./dist/release/manifest.json'); if (m.version !== '9.9.9') process.exit(1); console.log(m.version)"
```

Expected: prints `9.9.9`.

- [ ] **Step 3: Verify no beta manifest remains**

Run:

```bash
test ! -f manifest-beta.json
git grep -n "manifest-beta" -- . ':!docs/superpowers/plans/2026-05-16-modern-lint-and-brat-release-flow.md'
```

Expected: no tracked `manifest-beta.json`, and no release scripts depend on it.

- [ ] **Step 4: Verify GitHub workflow files parse**

Run:

```bash
npx prettier --check .github/workflows/*.yml
```

Expected: workflow YAML is readable and formatted, or install/configure a YAML formatter before enforcing this in CI.

- [ ] **Step 5: Final commit if needed**

Run:

```bash
git status --short
git log --oneline --max-count 10
```

Expected: working tree clean and commits are small enough to review.

---

## Self-Review

- Spec coverage: The plan installs the official Obsidian ESLint plugin, replaces legacy lint config, adds CI coverage, removes the need for `manifest-beta.json`, keeps all tags production-shaped, and updates release automation for BRAT's GitHub-release-based model.
- Placeholder scan: No task relies on "TBD" or an unspecified implementation.
- Type consistency: The planned scripts use npm consistently, exact semver tags consistently, and release asset `manifest.json` versions consistently derive from the tag.
