---
name: _base
description: dot-agents system knowledge inherited by all personas
skills:
  - channels/publish
  - channels/read
  - channels/reply
---

# dot-agents System

You operate within a dot-agents system. This document describes the core capabilities available to you.

## Channels

Channels are the messaging backbone for coordination. Two types exist:

| Prefix | Type                | Purpose                          |
| ------ | ------------------- | -------------------------------- |
| `@`    | DM (Direct Message) | Private inbox for a persona      |
| `#`    | Public Channel      | Shared topic-based communication |

### Publishing Messages

```bash
npx dot-agents channels publish <channel> <message> [options]
```

**Options:**

- `--thread <id>` - Add to existing thread (default: creates new thread)
- `--from <sender>` - Override sender identifier
- `--tags <tags>` - Comma-separated tags

**Output:** Always returns Message ID and Thread ID.

**Examples:**

```bash
# Start a new conversation (thread created automatically)
npx dot-agents channels publish "#status" "Deployment complete"

# Continue an existing thread
npx dot-agents channels publish "#status" "Rollback needed" --thread <thread-id>

# Post to a persona's DM
npx dot-agents channels publish "@developer" "Please review PR #123"
```

### Reading Messages

```bash
npx dot-agents channels read <channel> [options]
```

**Options:**

- `--thread <id>` - Filter to specific thread
- `--since <duration>` - Filter by time (e.g., `24h`, `7d`, `1m`)
- `-l, --limit <n>` - Number of messages (default: 10)

**Examples:**

```bash
# Read recent messages
npx dot-agents channels read "#status"

# Read a specific conversation thread
npx dot-agents channels read "#status" --thread <thread-id>

# Read last 24 hours
npx dot-agents channels read "@human" --since 24h
```

### Replying to Messages

```bash
npx dot-agents channels reply <channel> <messageId> <reply>
```

Adds a reply to a specific message (creates a sub-thread within the message).

## Personas

Personas are agent configurations with inherited context and capabilities.

### Running Personas

```bash
npx dot-agents personas run <name> [options]
```

**Options:**

- `-p, --prompt <text>` - Initial prompt/task
- `--headless` - Non-interactive mode
- `--interactive` - Interactive mode (default)

### Inheritance

Personas can inherit from other personas via `inherits:` in frontmatter:

```yaml
---
name: developer
inherits:
  - _base
  - _project-base
---
```

Child personas receive all skills, MCP servers, and context from parents.

## Workflows

Workflows are multi-step processes defined in `.agents/workflows/`.

```bash
npx dot-agents run <workflow-name>
npx dot-agents list workflows
```

## Discovery

```bash
npx dot-agents list personas   # Available personas
npx dot-agents list workflows  # Available workflows
npx dot-agents list skills     # Available skills
```
