---
name: release
description: Bump version, create tag, and finalize release
persona: developer
on:
  manual: true
---

Finalize a release by bumping version and creating a tag.

## Prerequisites

**Run `pre-release` workflow first.** This workflow assumes:

- Tests pass
- Documentation is updated
- CHANGELOG.md is updated
- Release review is approved

## Pre-flight Checks

1. **Verify clean state**

   ```bash
   git status  # Should be clean
   git branch --show-current  # Should be main
   ```

2. **Verify pre-release completed**
   - CHANGELOG.md has entry for new version
   - All preparation commits are in

## Release Steps

### 1. Confirm Version Bump

Verify the version bump type from pre-release preparation:

```bash
# Check current version
node -p "require('./package.json').version"

# Check what will be released
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

### 2. Bump Version

```bash
npm version <patch|minor|major>
```

This command:

- Updates `package.json` version
- Creates a git commit
- Creates a git tag (vX.Y.Z)

### 3. Verify

```bash
# Check new version
node -p "require('./package.json').version"

# Check tag was created
git tag --list | tail -5
```

### 4. Report

Output release summary:

```text
## Release Complete

**Version:** x.y.z
**Tag:** vx.y.z

### Next Steps (Manual)

1. Push commits and tag:
   git push origin main
   git push origin vx.y.z

2. Publish to npm (if applicable):
   npm publish

3. Create GitHub release (optional):
   - Go to releases page
   - Select the new tag
   - Copy changelog entry as release notes
```

Do NOT push or publish automatically. Report what was done and let the human decide on distribution.
