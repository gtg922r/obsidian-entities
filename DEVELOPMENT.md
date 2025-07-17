# Development Guide

This guide explains the development workflow for the Obsidian Entities plugin, including versioning, changelog management, and release processes.

## Overview

This project follows [Semantic Versioning](https://semver.org/) and uses [Conventional Commits](https://www.conventionalcommits.org/) to automatically generate releases and changelogs via [release-please](https://github.com/googleapis/release-please).

## Development Workflow

### 1. Making Changes

When making changes to the codebase:

1. **Use Conventional Commits**: Follow the conventional commit format for all commits:
   ```
   feat: add new entity completion feature
   fix: resolve issue with template suggestions
   docs: update README with new configuration options
   ```

2. **Commit Types**:
   - `feat:` - New features (triggers minor version bump)
   - `fix:` - Bug fixes (triggers patch version bump)
   - `feat!:` or `fix!:` - Breaking changes (triggers major version bump)
   - `docs:`, `style:`, `refactor:`, `test:`, `chore:` - No version bump

### 2. Changelog Management

The changelog is automatically managed by release-please based on conventional commits:

- **Manual Updates**: You can manually edit `CHANGELOG.md` to add more detailed descriptions
- **Format**: We follow [Keep a Changelog](https://keepachangelog.com/) format
- **Automatic Updates**: Release-please will automatically update the changelog with new releases

### 3. Version Management

#### Semantic Versioning Rules

- **Patch** (0.0.X): Bug fixes, small improvements
- **Minor** (0.X.0): New features, backwards-compatible changes
- **Major** (X.0.0): Breaking changes

#### Important for Obsidian Plugins

> [!IMPORTANT]
> Obsidian does not support the full semver spec. If you use `-preview` and other branches to build beta versions of your plugin, Obsidian will not pick up the final release automatically, unless the version number is bumped at least a minor release number higher than the beta version.

For example:
- If users have `1.0.1-preview.1`, Obsidian won't auto-update to `1.0.1`
- But it will auto-update to `1.0.2` or higher
- Use BRAT for beta testing and upgrades

## Release Processes

### Production Releases

Production releases are fully automated through GitHub Actions and release-please:

1. **Automatic Release PR**: After merging commits with conventional commit messages, release-please will automatically create a "Release PR" that:
   - Updates the version in `package.json`, `manifest.json`, and `versions.json`
   - Updates the `CHANGELOG.md`
   - Creates a release commit

2. **Merge Release PR**: When you merge the release PR, it automatically:
   - Creates a GitHub release with proper assets
   - Builds and attaches `main.js`, `manifest.json`, and `styles.css`
   - Publishes the release for Obsidian's community plugin system

3. **Manual Commands** (if needed):
   ```bash
   # Generate a release PR manually
   npm run release:pr
   
   # Create a release from the current state
   npm run release:create
   ```

### Beta Releases (BRAT Testing)

For beta testing with [Obsidian BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. **Create a Beta Release**:
   ```bash
   # Create a beta release with preview tag
   npm run release:beta
   ```

2. **Manual Beta Process**:
   - Create a GitHub release manually
   - Mark it as "pre-release"
   - Ensure `manifest.json`, `main.js`, and `styles.css` are included as assets
   - Use version format like `1.0.1-preview.1` for the tag

3. **Beta Testing Workflow**:
   - Share the repository URL with beta testers
   - They install via BRAT using the repository URL
   - BRAT will pick up the latest release (including pre-releases)

> [!NOTE]
> **Don't commit manifest.json changes to main branch** when creating beta releases. The manifest should only be updated on the main branch when doing production releases.

### Version Bump Scripts

The following npm scripts are available:

```bash
# Development and building
npm run dev          # Start development build with watch mode
npm run build        # Build for production

# Testing
npm run test         # Run tests

# Release management
npm run release:pr       # Create a release PR using release-please
npm run release:create   # Create a release from current state
npm run release:beta     # Create a beta release for BRAT testing

# Legacy version bump (deprecated - use release-please instead)
npm run version     # Legacy manual version bump
```

## File Management

### Key Files

- **`package.json`**: Contains the version and dependencies
- **`manifest.json`**: Obsidian plugin manifest (version synced automatically)
- **`versions.json`**: Maps plugin versions to minimum Obsidian versions
- **`CHANGELOG.md`**: Automatically managed changelog
- **`.release-please-config.json`**: Release-please configuration

### Automatic File Updates

When a release is created, the following files are automatically updated:
- `package.json` - version field
- `manifest.json` - version field (synced from package.json)
- `versions.json` - adds new version with minAppVersion
- `CHANGELOG.md` - adds new release section

## GitHub Actions Workflows

### Release Workflow

The release workflow (`.github/workflows/release-please.yml`) handles:
- Creating release PRs
- Building the plugin
- Creating GitHub releases with assets
- Publishing to the Obsidian community plugin directory

### Manual Release Workflow

The legacy release workflow (`.github/workflows/release.yml`) can still be triggered manually for special cases.

## Best Practices

### Commit Messages

```bash
# Good examples
feat: add emoji autocomplete support
fix: resolve template loading issue in nested folders
docs: update configuration examples
feat!: change API for entity providers (breaking change)

# Avoid
update stuff
fix bug
improvements
```

### Beta Testing Strategy

1. **Use semantic prerelease versions**: `1.0.1-preview.1`, `1.0.1-beta.1`
2. **Test extensively** before promoting to production
3. **Communicate clearly** with beta testers about version numbering
4. **Plan version jumps** to ensure Obsidian's auto-update works correctly

### Release Planning

- **Patch releases**: Quick bug fixes, can be released frequently
- **Minor releases**: New features, plan these for logical feature groupings
- **Major releases**: Breaking changes, plan carefully and communicate widely

## Troubleshooting

### Common Issues

1. **Release PR not created**: Check that commits follow conventional commit format
2. **Version not bumping**: Ensure commit types are correct (`feat:`, `fix:`, etc.)
3. **Obsidian not auto-updating**: Check version numbering with prereleases
4. **BRAT not finding release**: Ensure release assets include required files

### Manual Recovery

If automated systems fail:

```bash
# Manually bump version and update files
npm version patch  # or minor/major
npm run build

# Manually create release
git tag v$(node -p "require('./package.json').version")
git push origin --tags
```

## Quick Reference

### Common Commands

```bash
# Development
npm run dev                    # Start development with watch mode
npm run build                  # Build for production
npm test                       # Run tests

# Release Management (Automated)
npm run release:pr             # Create release PR (manual trigger)
npm run release:create         # Create release (manual trigger)

# Beta Testing
npm run release:beta           # Create preview.1 beta release
npm run release:beta beta.2    # Create beta.2 release
npm run release:beta alpha     # Create alpha.1 release

# Legacy (deprecated)
npm run version               # Manual version bump (use release-please instead)
```

### Workflow Summary

1. **Normal Development**: Make commits with conventional commit format
2. **Production Release**: Merge the auto-generated release PR
3. **Beta Release**: Run `npm run release:beta` and push the created tag
4. **Emergency Fix**: Use legacy workflow or manual GitHub release

### File Overview

| File | Purpose | Auto-Updated |
|------|---------|--------------|
| `package.json` | NPM package version | ✅ |
| `manifest.json` | Obsidian plugin manifest | ✅ |
| `versions.json` | Version/Obsidian compatibility mapping | ✅ |
| `CHANGELOG.md` | Release notes and history | ✅ |
| `.release-please-config.json` | Release automation config | ❌ |
| `.release-please-manifest.json` | Version tracking | ✅ |

## Resources

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [release-please Documentation](https://github.com/googleapis/release-please)
- [Obsidian BRAT Plugin](https://github.com/TfTHacker/obsidian42-brat)