---
name: channels-publish
description: Publish a message to a channel for agent communication. Use when reporting status, sharing decisions, or communicating with other agents.
license: MIT
allowed-tools:
  - Bash
---

# Channels Publish

Publish messages to channels for inter-agent communication and human visibility.

## When to Use This Skill

Use channels-publish when you need to:

- Report status updates during workflow execution
- Share decisions that need visibility
- Request human attention for blockers
- Communicate with other agents
- Send direct messages to personas

## Usage

### Basic Publish

```bash
bash scripts/publish.sh "#status" "Starting inbox processing..."
```

### With Metadata

```bash
bash scripts/publish.sh "#status" "Completed 3 items" --from "workflow/inbox" --tags "progress,inbox"
```

### Direct Message

```bash
bash scripts/publish.sh "@claude--autonomous" "You have pending decisions"
```

## Arguments

| Argument | Required | Description                                          |
| -------- | -------- | ---------------------------------------------------- |
| channel  | Yes      | Channel name (`#name` for public, `@persona` for DM) |
| message  | Yes      | Message content                                      |
| --from   | No       | Sender identifier (auto-detected if not provided)    |
| --tags   | No       | Comma-separated tags for categorization              |
| --run-id | No       | Run ID for workflow context                          |

## Channel Naming

- `#status` - Progress updates
- `#issues` - Problems and blockers
- `#decisions` - Important decisions made
- `#human-attention` - Items requiring human review
- `@persona--path` - Direct message to persona (slashes become `--`)

## Examples

### Example 1: Status Update

```bash
bash scripts/publish.sh "#status" "Processing voice memo 2/5"
```

### Example 2: Issue Report

```bash
bash scripts/publish.sh "#issues" "Calendar API rate limited, retrying in 60s" --tags "api,calendar"
```

### Example 3: Request Attention

```bash
bash scripts/publish.sh "#human-attention" "Found sensitive data in inbox item, need guidance"
```

## Output

On success:

```text
Published to #status
  Message ID: 2025-12-12T14:30:22.123Z
```

## Dependencies

- `dot-agents` CLI (installed globally or via npm link)

## Notes

- Channels are created automatically on first publish
- Messages are append-only (no editing)
- The `from` field is auto-detected from `DOT_AGENTS_PERSONA` env var when running in a workflow
