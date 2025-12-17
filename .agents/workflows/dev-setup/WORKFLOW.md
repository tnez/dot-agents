---
name: dev-setup
description: Onboard a new contributor to the project
persona: developer
on:
  manual: true
---

Help onboard a new contributor to the dot-agents project.

## Setup Steps

1. **Check Prerequisites**
   - Node.js version (check .nvmrc if present)
   - npm version
   - Git configuration

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Build the Project**

   ```bash
   npm run build
   ```

4. **Run Tests**

   ```bash
   npm test
   ```

5. **Verify CLI Works**

   ```bash
   npx dot-agents --help
   ```

## Explain the Codebase

Provide a brief orientation:

- Project structure overview
- Key files to understand first
- How to run in development mode
- How to add new commands
- How to add new personas/workflows

## Report

Output a summary:

- Setup status (success/issues)
- Any warnings or recommendations
- Quick reference for common tasks
