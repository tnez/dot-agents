---
name: pr-prep
description: Prepare a pull request with tests, lint, and description
persona: developer
on:
  manual: true
---

Prepare this branch for a pull request.

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
   - Run `git diff main...HEAD` to see all changes
   - Summarize what changed and why

5. **Generate PR Description**
   Output a PR description in this format:

   ```markdown
   ## Summary

   <1-2 sentence description of the change>

   ## Changes

   - <bullet point for each logical change>

   ## Testing

   - <how was this tested?>
   ```

Report any blockers encountered during preparation.
