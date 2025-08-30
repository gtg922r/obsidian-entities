# Release Process

This document describes the automated release process for the Obsidian Entities plugin, which follows [Keep a Changelog](https://keepachangelog.com/) best practices and [Semantic Versioning](https://semver.org/).

## Quick Start

To create a new release, simply run one of these commands:

```bash
# Preview what would happen (safe demo mode)
npm run release:demo patch

# For bug fixes and patches
npm run release:patch

# For new features (backward compatible)
npm run release:minor

# For breaking changes
npm run release:major
```

## Before Releasing

1. **Update CHANGELOG.md**: Add your changes to the `[Unreleased]` section under the appropriate category:
   - **Added** for new features
   - **Changed** for changes in existing functionality
   - **Deprecated** for soon-to-be removed features
   - **Removed** for now removed features
   - **Fixed** for any bug fixes
   - **Security** for vulnerability fixes

2. **Ensure all changes are committed**: The release script will fail if there are uncommitted changes.

3. **Make sure tests pass**: Run `npm test` to verify everything works.

## What the Release Script Does

The automated release script (`scripts/release.mjs`) performs the following steps:

### 🔍 Pre-release Validation
- ✅ Checks that working directory is clean (no uncommitted changes)
- ✅ Validates CHANGELOG.md format and ensures [Unreleased] section has content
- ✅ Runs all tests to ensure they pass
- ✅ Performs a production build to verify everything compiles

### 📦 Version Management
- 🔄 Calculates new version based on release type (major/minor/patch)
- 📝 Updates `package.json`, `manifest.json`, and `versions.json`
- 📋 Moves [Unreleased] changes to new version section in CHANGELOG.md
- 🔗 Updates changelog links for the new version

### 🚀 Release Execution
- 💾 Commits all version changes with message `chore: release vX.Y.Z`
- 🏷️ Creates annotated git tag `vX.Y.Z`
- ⬆️ Pushes commit and tags to GitHub
- 🤖 Triggers GitHub Actions workflow for automated release

### 🎯 GitHub Automation
- 🧪 GitHub Actions runs tests again for safety
- 🏗️ Builds the plugin for distribution
- 📦 Creates GitHub release with changelog content as release notes
- 📎 Attaches plugin files (main.js, manifest.json, styles.css, zip)

## Manual Steps (if needed)

If you need to perform any steps manually:

```bash
# Validate changelog format
npm run changelog:validate

# Extract changelog for specific version
npm run changelog:extract 1.2.3

# Test the build process
npm run build

# Run tests
npm test
```

## Changelog Format

Follow this format in CHANGELOG.md:

```markdown
## [Unreleased]

### Added
- New feature description

### Fixed
- Bug fix description

### Changed
- Breaking change description
```

## Troubleshooting

**Release script fails with "No changes found in [Unreleased] section"**
- Add your changes to the CHANGELOG.md under the [Unreleased] section

**Release script fails with "Working directory is not clean"**
- Commit or stash your changes before running the release script

**GitHub Actions fails to build**
- Check that all files are properly committed and the build works locally

**Wrong version number**
- The script automatically calculates the next version based on the release type you choose

## Version Numbering

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes that require users to modify their usage
- **MINOR** (X.Y.0): New features that are backward compatible
- **PATCH** (X.Y.Z): Bug fixes and small improvements

## Files Updated During Release

The release process automatically updates these files:
- `package.json` - npm package version
- `manifest.json` - Obsidian plugin manifest version
- `versions.json` - Obsidian version compatibility mapping
- `CHANGELOG.md` - Release notes and version history