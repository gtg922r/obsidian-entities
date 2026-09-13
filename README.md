# Entities

<p align="center">
<img src="https://img.shields.io/github/v/release/gtg922r/obsidian-entities?label=Release">
<img src="https://github.com/gtg922r/obsidian-entities/actions/workflows/release.yml/badge.svg">
<img src="https://img.shields.io/github/license/gtg922r/obsidian-entities">
</p>

> [!IMPORTANT]
> This plugin is in very early development and is not intended for public usage.
> Note that at this time, all rights are reserved.

**Entities** is an advanced autocomplete plugin for [Obsidian](https://obsidian.md) that provides context-aware suggestions for notes, templates and helper actions.

<p align="center">
  <img width="700" src="https://raw.githubusercontent.com/gtg922r/obsidian-entities/refs/heads/master/.github/entities-screenshot.png">
</p>

## Features

- ✨ Autocomplete triggered by `@`, `:` or `/`
- 📦 Multiple pluggable providers
- 🤝 Works with popular Obsidian plugins
- 🎛 Customizable provider settings
- 📱 Desktop and mobile support

## Entity Providers

Each provider offers suggestions from a different source or performs actions:

- 📁 **Folder** – notes from a specific folder
- 📊 **Dataview** – results from a Dataview query
- 📄 **Template** – create or insert using template files
- 📅 **Date** – natural language date completion (requires Natural Language Dates)
- 🗂️ **Metadata Menu** – create notes from Metadata Menu file class templates
- ⚡ **Helper Actions** – quick checkboxes and utilities triggered by `/`
- 😀 **Character** – emoji and Font Awesome look‑ups triggered by `:`

See [ARCHITECTURE.md](ARCHITECTURE.md) for implementation details.

## Installation

1. Download the latest release from the [Releases page](https://github.com/gtg922r/obsidian-entities/releases).
2. Extract the folder into your `.obsidian/plugins/` directory.
3. Enable **Entities** in Obsidian’s *Community Plugins* settings.

To build from source:

```bash
nvm install
nvm use
npm ci
npm run build
```

See the development requirements below if you use a different Node version manager.

## Usage

Open **Settings → Entities** to add providers and configure their options. Start typing `@`, `:` or `/` to see the autocomplete menu.

## Development

Use **Node.js 24.21.0 LTS with its bundled npm 11.19.0**. The exact Node version
is recorded in `.nvmrc`; both CI and the release workflow read that file. Node 24
is a [supported LTS line](https://nodejs.org/en/about/previous-releases); Node 20
is end-of-life. When updating the baseline, keep `.nvmrc`, `package.json` engines,
and this guide aligned, then validate a clean install and all checks.

Run `nvm install && nvm use` (or select the same version with your version manager),
then `npm ci`. Commit deliberate dependency updates in `package-lock.json`; use
`npm ci` for routine installs so local checks and CI use the same dependency tree.
Git is also required: the lockfile currently pins Obsidian API declarations
1.12.3 to a GitHub commit via Git SSH, which may require GitHub SSH access.
The declaration package and development Node version do not define the plugin's
Obsidian runtime floor; that remains `minAppVersion` in `manifest.json`.

Run the local quality checks with:

```bash
npm run lint
npm test
npm run build
```

Or run the full local check:

```bash
npm run check
```

Lint covers `src/`, `tests/`, `scripts/`, root `*.config.js` / `*.config.mjs`
files, and `version-bump.mjs`. It excludes nested `.worktrees/`, `.agents/`, and
`.codex/` directories and generated outputs. Jest discovers modules and mocks
only in `src/` and `tests/`, and runs `tests/**/*.test.ts`. Keep new code in these
locations or deliberately extend the check configuration.

`npm run build` type-checks the plugin and writes a production `main.js` in this
checkout. `npm run dev` watches source files and rebuilds `main.js` with an inline
source map; stop it with Ctrl+C. Use an isolated checkout to keep these outputs
separate from an installed plugin.

Check dependency advisories separately from deterministic code checks:

```bash
npm audit --omit=dev  # Runtime dependencies
npm audit            # Full tree, including development tools
```

As of September 13, 2026, both audits report **zero vulnerabilities**. The baseline
update addressed six high-severity development findings with compatible
transitive updates, plus the Babel, browser-mapping, and esbuild findings.
The esbuild [development-server advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)
did not affect our watch-only script; esbuild is nevertheless pinned to patched
0.25.12. Jest 29 / jsdom 20 still emit transitive deprecation warnings (including
`inflight` and `glob`); a framework migration is deferred. Audit results are a
dated advisory snapshot, not a runtime security guarantee.

## Releases

Release commands prepare reviewable metadata locally. Candidates use exact numeric
semver tags such as `0.4.5`, are packaged from a committed revision with a hash
receipt, and are explicitly published to BRAT as GitHub prereleases. Stable
promotion remains blocked until the tested tag and bytes can be preserved.

See [the release guide](docs/releasing.md) for preparation, observational dry runs,
packaging, deliberate publication and recovery after failures.

Contributions are welcome via pull requests.

## License

Released under the MIT License.
