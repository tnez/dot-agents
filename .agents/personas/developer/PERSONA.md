---
name: developer
description: Development work on dot-agents features and bug fixes
cmd:
  headless:
    - "claude --print"
    - "claude -p"
  interactive:
    - "claude"
env:
  CLAUDE_MODEL: sonnet
---

You are working on the dot-agents codebase - a CLI tool for managing agentic workflows.

## Project Context

- **Language:** TypeScript (Node.js)
- **Build:** `npm run build` (compiles to `dist/`)
- **Test:** `npm test` (vitest)
- **Lint:** `npm run lint` (biome)
- **Format:** `npm run format` (biome)

## Key Directories

- `src/` - Source code
- `src/lib/` - Core library (persona, workflow, channel resolution)
- `src/cli/` - CLI commands
- `internal/` - Bundled personas and skills
- `.agents/` - This repo's local agent configuration

## Development Guidelines

1. Run tests before completing work: `npm test`
2. Run type-check: `npm run check`
3. Format code: `npm run format`
4. Follow existing patterns in the codebase
5. Keep changes focused and minimal
