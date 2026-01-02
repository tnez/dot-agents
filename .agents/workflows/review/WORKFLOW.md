---
name: review
description: Run code review on recent changes before committing
persona: reviewer
on:
  manual: true
---

Review recent changes before committing.

## When to Use

Run this workflow before committing to catch issues early:

- After completing a feature or fix
- Before pushing changes
- When you want a second opinion on code quality

## Steps

1. **Identify Changes to Review**

   ```bash
   # Staged changes
   git diff --cached

   # Or all uncommitted changes
   git diff HEAD
   ```

2. **Run Quality Checks**

   ```bash
   npm test
   npm run check
   ```

3. **Review Focus Areas**

   Apply standard review criteria:
   - **Correctness** - Does the code do what it claims?
   - **Security** - Any injection risks, exposed secrets, unsafe operations?
   - **Type Safety** - Proper TypeScript usage, no `any` escapes
   - **Tests** - Are changes covered by tests?
   - **Simplicity** - Is this the simplest solution that works?
   - **MEMORY.md Sensitivity** - Check MEMORY.md files for sensitive content

4. **Check MEMORY.md Files**

   ```bash
   git diff --cached -- '**/MEMORY.md'
   ```

   Flag any secrets, credentials, API keys, or personal info.

5. **Output Review**

   Structure your review as:
   - **Summary:** One-line assessment
   - **Concerns:** Any issues that need addressing (blocking)
   - **Suggestions:** Optional improvements (non-blocking)
   - **Verdict:** approve / request-changes / discuss

## Notes

- This is for internal contributor use (pre-commit review)
- For external contributors preparing PRs, see `pr-prep` workflow
- For release preparation, see `pre-release` workflow
