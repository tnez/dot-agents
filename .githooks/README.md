# Git Hooks

Custom git hooks for the agent-skills repository.

## Configured Hooks

### commit-msg

Validates commit message format and strips AI attribution.

**Validates**:
- Conventional Commits format: `type(scope): description`
- Blank line between subject and body (if body exists)
- Valid types: feat, fix, docs, style, refactor, test, chore

**Removes**:
- Claude Code signatures (`🤖 Generated with [Claude Code]`)
- Co-Authored-By: Claude lines
- AI-related emojis
- Other agentic attribution

**How it works**:
1. Validates Conventional Commits format
2. Ensures proper blank line separation
3. Attempts to use Claude Code in non-interactive mode to intelligently clean the message
4. Falls back to regex-based cleaning if Claude Code is unavailable
5. Preserves the actual commit message content

**Usage**: Automatic - runs on every commit

### pre-commit

Runs linting and formatting checks on staged files before commit.

**Current checks** (placeholders):
- Markdown linting (TODO: add markdownlint)
- Prettier formatting (TODO: add prettier)
- Python linting (TODO: add ruff/black)
- YAML validation (TODO: add yamllint)

**Usage**: Automatic - runs before every commit

## Setup

**Required for all contributors:**

Hooks must be configured using an **absolute path** due to the worktree setup:

```bash
# From repository root
git config --local core.hooksPath /Users/tnez/Code/tnez/agent-skills/main/.githooks
```

Or set your own absolute path:
```bash
git config --local core.hooksPath "$(pwd)/main/.githooks"
```

**Why absolute path?**
- This repository uses a worktree setup with `main/` as the working directory
- Git doesn't correctly resolve relative paths for hooks in this configuration
- Using absolute paths ensures hooks execute reliably

**Verify setup:**
```bash
# Check hooks path is set
git config --local core.hooksPath

# Should output: /Users/tnez/Code/tnez/agent-skills/main/.githooks (or your path)
```

## Adding New Linters

### Markdown Linting

```bash
npm install -g markdownlint-cli
```

Update `.githooks/pre-commit`:
```bash
markdownlint '**/*.md' --ignore node_modules
```

### Prettier

```bash
npm install -g prettier
```

Update `.githooks/pre-commit`:
```bash
prettier --check '**/*.{md,json,yml,yaml}'
```

### Python Linting (Ruff)

```bash
pip install ruff
```

Update `.githooks/pre-commit`:
```bash
ruff check meta/*/scripts/*.py
```

### YAML Linting

```bash
pip install yamllint
```

Update `.githooks/pre-commit`:
```bash
# Create .yamllint config first
yamllint **/*.md  # Check YAML frontmatter
```

## Testing Hooks

### Test commit-msg hook

```bash
# Create a test commit with AI attribution
echo "test file" > test.txt
git add test.txt
git commit -m "Test commit

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Check the actual commit message was cleaned
git log -1 --pretty=%B
```

### Test pre-commit hook

```bash
# Hook runs automatically on commit
git add <file>
git commit -m "message"
```

## Bypassing Hooks

If you need to bypass hooks (use sparingly):

```bash
# Skip all hooks
git commit --no-verify -m "message"

# Skip specific hook by temporarily removing execute permission
chmod -x .githooks/pre-commit
git commit -m "message"
chmod +x .githooks/pre-commit
```

## Maintenance

- Hooks are version-controlled in `main/.githooks/`
- Each contributor must configure hooks path locally (not stored in repo)
- Update hooks by editing files in `.githooks/` and committing

## Troubleshooting

**Hook not running**:
```bash
# Verify hooksPath is set (must be absolute path)
git config --get core.hooksPath

# Should show absolute path like: /Users/tnez/Code/tnez/agent-skills/main/.githooks

# Verify hook is executable
ls -la main/.githooks/

# Re-configure if needed
git config --local core.hooksPath "$(pwd)/main/.githooks"
```

**Claude Code not available**:
- commit-msg hook falls back to regex-based cleaning
- No action needed, hook will still work

**Pre-commit failing**:
- Check which linter is failing
- Fix the issue or update the hook configuration
- Use `--no-verify` only as last resort
