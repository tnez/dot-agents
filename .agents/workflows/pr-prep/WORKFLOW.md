---
name: pr-prep
description: Help external contributors prepare pull requests
persona: developer
on:
  manual: true
---

Help an external contributor prepare their branch for a pull request.

## Audience

This workflow is for **external contributors** submitting PRs to dot-agents. Internal contributors should use the `review` workflow for pre-commit checks.

## Steps

1. **Run Tests**

   ```bash
   npm test
   ```

   Fix any failing tests before continuing.

2. **Type Check**

   ```bash
   npm run check
   ```

   Fix any type errors before continuing.

3. **Lint & Format**

   ```bash
   npm run lint
   npm run format
   ```

   Fix any lint errors. Commit formatting changes if any.

4. **Review Changes**

   ```bash
   git diff main...HEAD
   ```

   Summarize what changed and why.

5. **Check for Common Issues**
   - [ ] No secrets or credentials in code
   - [ ] Tests added for new functionality
   - [ ] Types properly defined (no `any` escapes)
   - [ ] Follows existing code patterns
   - [ ] MEMORY.md files don't contain sensitive info

6. **Generate PR Description**

   Output a PR description in this format:

   ```markdown
   ## Summary

   <1-2 sentence description of the change>

   ## Changes

   - <bullet point for each logical change>

   ## Testing

   - <how was this tested?>

   ## Checklist

   - [ ] Tests pass (`npm test`)
   - [ ] Types check (`npm run check`)
   - [ ] Code formatted (`npm run format`)
   ```

Report any blockers encountered during preparation.
