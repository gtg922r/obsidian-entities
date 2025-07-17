# Release Workflow Quick Guide

This document provides a quick reference for the automated release system set up for the Obsidian Entities plugin.

## 🚀 Production Releases (Automatic)

1. **Make changes** with conventional commits:
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve bug"
   git commit -m "feat!: breaking change"
   ```

2. **Push to main** - release-please will automatically create a release PR

3. **Review and merge** the release PR - this triggers:
   - Automatic version bump
   - Changelog update
   - GitHub release creation
   - Asset uploads for Obsidian

## 🧪 Beta Releases (Manual)

For testing with [Obsidian BRAT](https://github.com/TfTHacker/obsidian42-brat):

```bash
# Quick beta release
npm run release:beta

# Specific beta versions
npm run release:beta preview.2
npm run release:beta beta.1
npm run release:beta alpha.3

# Then push the tag
git push origin --tags
```

The GitHub Action will automatically create a pre-release with the necessary assets.

## 📝 Commit Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` → Minor version bump (new features)
- `fix:` → Patch version bump (bug fixes)  
- `feat!:` or `fix!:` → Major version bump (breaking changes)
- `docs:`, `style:`, `chore:` → No version bump

## ⚙️ Available Scripts

```bash
npm run dev              # Development mode
npm run build            # Production build
npm run test             # Run tests
npm run release:beta     # Create beta release
npm run release:pr       # Manual release PR creation
npm run release:create   # Manual release creation
```

## 📂 Key Files

- `CHANGELOG.md` - Auto-generated from commits
- `manifest.json` - Auto-updated with new versions
- `versions.json` - Auto-updated with compatibility info
- `package.json` - Source of truth for version

## ⚠️ Important Notes

### Obsidian Version Compatibility

Obsidian doesn't follow full semver for updates:
- Users on `1.0.1-preview.1` won't auto-update to `1.0.1`
- They will auto-update to `1.0.2` or higher
- Use BRAT for beta testing and upgrades

### Beta Testing Workflow

1. **Don't commit** `manifest.json` changes to main during beta releases
2. Beta script automatically handles version temporarily
3. Share repository URL with testers for BRAT installation
4. Plan version jumps carefully for proper auto-updates

## 🆘 Emergency Procedures

If automation fails:

```bash
# Manual version bump
npm version patch  # or minor/major
npm run build

# Manual release
git tag v$(node -p "require('./package.json').version")
git push origin --tags
```

## 🔗 Resources

- [Full Development Guide](./DEVELOPMENT.md)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Obsidian BRAT](https://github.com/TfTHacker/obsidian42-brat)