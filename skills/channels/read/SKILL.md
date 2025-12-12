---
name: channels-read
description: Read messages from a channel. Use when checking for updates, reviewing status, or catching up on communication.
license: MIT
allowed-tools:
  - Bash
---

# Channels Read

Read messages from channels to stay informed about agent activity and communications.

## When to Use This Skill

Use channels-read when you need to:

- Check for status updates from other agents
- Review recent activity in a channel
- Catch up on decisions made
- Check for issues or blockers
- Read direct messages sent to you

## Usage

### Basic Read

```bash
bash scripts/read.sh "#status"
```

### With Filters

```bash
bash scripts/read.sh "#status" --limit 5
bash scripts/read.sh "#status" --since 24h
```

## Arguments

| Argument | Required | Description                                      |
| -------- | -------- | ------------------------------------------------ |
| channel  | Yes      | Channel name to read from                        |
| --limit  | No       | Number of messages to show (default: 10)         |
| --since  | No       | Show messages since duration (e.g., 24h, 7d, 4w) |

## Duration Format

- `h` - hours (e.g., `24h`)
- `d` - days (e.g., `7d`)
- `w` - weeks (e.g., `4w`)
- `m` - months (e.g., `1m`)

## Examples

### Example 1: Recent Status

```bash
bash scripts/read.sh "#status"
```

### Example 2: Last Hour's Issues

```bash
bash scripts/read.sh "#issues" --since 1h
```

### Example 3: Check DMs

```bash
bash scripts/read.sh "@claude--autonomous"
```

## Output

```text
#status (3 messages):

  [12/12/2025, 2:30:22 PM] agent:workflow/inbox
    ID: 2025-12-12T14:30:22.123Z
    Starting inbox processing...
    └─ 2 replies

  [12/12/2025, 2:45:00 PM] agent:workflow/inbox
    ID: 2025-12-12T14:45:00.456Z
    Processed 5 voice memos
```

## Dependencies

- `dot-agents` CLI (installed globally or via npm link)

## Notes

- Messages are shown newest first
- Reply counts are displayed but not expanded (use channel thread for full replies)
- Empty channels show "No messages in #channel"
