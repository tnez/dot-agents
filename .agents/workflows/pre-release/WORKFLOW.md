---
name: pre-release
description: Prepare documentation, changelog, and version for release
persona: root
on:
  manual: true
---

Prepare for a new release of dot-agents.

## When to Use

Run this workflow when you're ready to prepare a release. This handles all preparation steps before the actual version bump and tag.

## Pre-flight Checks

1. **Ensure clean state**

   ```bash
   git status
   git branch --show-current  # Should be main
   ```

2. **Run full test suite**

   ```bash
   npm test
   npm run check
   ```

## Steps

### 1. Identify Changes Since Last Release

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

Categorize changes:

- **Features** - New functionality
- **Fixes** - Bug fixes
- **Breaking** - Breaking changes (triggers major bump)
- **Docs** - Documentation updates
- **Internal** - Refactoring, tests, tooling

### 2. Determine Version Bump

Based on changes:

- **patch** (0.0.x) - Bug fixes only
- **minor** (0.x.0) - New features, no breaking changes
- **major** (x.0.0) - Breaking changes

### 3. Update Documentation

Check if README.md needs updates:

- [ ] New features documented
- [ ] Changed APIs updated
- [ ] Installation instructions current
- [ ] Examples still accurate

If updates needed, make them now and commit.

### 4. Update CHANGELOG.md

Add entry for new version:

```markdown
## [x.y.z] - YYYY-MM-DD

### Added

- <new features>

### Changed

- <changes to existing functionality>

### Fixed

- <bug fixes>

### Breaking

- <breaking changes>
```

Commit changelog updates.

### 5. Run Release Review

Invoke reviewer for release-scope review:

```bash
npx dot-agents personas run reviewer --headless --prompt "Review all changes since last release for release readiness. Check: breaking changes documented, CHANGELOG accurate, docs updated. Run: git diff $(git describe --tags --abbrev=0)..HEAD"
```

Address any concerns before proceeding.

### 6. Report Readiness

Output a release preparation summary:

```markdown
## Release Preparation Summary

**Proposed version:** x.y.z
**Version bump type:** patch | minor | major

### Changes included

- <summary of changes>

### Documentation updates

- <what was updated, or "none needed">

### Changelog

- <confirm CHANGELOG.md updated>

### Review status

- <reviewer verdict>

### Ready to release?

- [ ] Tests pass
- [ ] Docs updated
- [ ] Changelog updated
- [ ] Review approved

**Next step:** Run `release` workflow to bump version and tag
```

Do NOT bump version or create tags. That's the `release` workflow's job.
