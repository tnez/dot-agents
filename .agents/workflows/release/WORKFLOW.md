---
name: release
description: Version bump, changelog, and release tag
persona: developer
on:
  manual: true
---

Prepare a new release of dot-agents.

## Pre-flight Checks

1. Ensure working directory is clean: `git status`
2. Ensure on main branch: `git branch --show-current`
3. Ensure tests pass: `npm test`
4. Ensure types check: `npm run check`

## Release Steps

1. **Determine Version Bump**
   - Check recent commits since last tag: `git log $(git describe --tags --abbrev=0)..HEAD --oneline`
   - Determine if this is a patch, minor, or major bump based on changes

2. **Bump Version**

   ```bash
   npm version <patch|minor|major>
   ```

   This updates package.json and creates a git tag.

3. **Generate Changelog Entry**
   - Review commits since last tag
   - Summarize user-facing changes
   - Output a changelog entry for CHANGELOG.md (if it exists)

4. **Report**
   Output:
   - New version number
   - Summary of changes
   - Next steps (push, publish, etc.)

Do NOT push or publish. Report what was done and what the human should do next.
