---
name: channels-reply
description: Reply to a message thread in a channel. Use when responding to questions, providing updates on reported issues, or continuing a conversation.
license: MIT
allowed-tools:
  - Bash
---

# Channels Reply

Reply to existing messages to create threaded conversations.

## When to Use This Skill

Use channels-reply when you need to:

- Respond to a question in a channel
- Provide an update on a reported issue
- Continue a conversation thread
- Add context to an existing message

## Usage

### Basic Reply

```bash
bash scripts/reply.sh "#status" "2025-12-12T14:30:22.123Z" "Task completed successfully"
```

### With Sender

```bash
bash scripts/reply.sh "#status" "2025-12-12T14:30:22.123Z" "Fixed the issue" --from "workflow/fix"
```

## Arguments

| Argument  | Required | Description                                       |
| --------- | -------- | ------------------------------------------------- |
| channel   | Yes      | Channel containing the message                    |
| messageId | Yes      | ID of the message to reply to (ISO timestamp)     |
| message   | Yes      | Reply content                                     |
| --from    | No       | Sender identifier (auto-detected if not provided) |

## Finding Message IDs

Use `channels-read` to find message IDs:

```bash
bash ../read/scripts/read.sh "#status"
```

Output includes IDs like:

```text
  [12/12/2025, 2:30:22 PM] agent:workflow/inbox
    ID: 2025-12-12T14:30:22.123Z  <-- Use this ID
    Starting inbox processing...
```

## Examples

### Example 1: Update on Issue

```bash
bash scripts/reply.sh "#issues" "2025-12-12T10:00:00.000Z" "Resolved - was a network timeout"
```

### Example 2: Answer Question

```bash
bash scripts/reply.sh "#decisions" "2025-12-12T09:30:00.000Z" "Approved, proceeding with option A"
```

## Output

On success:

```text
Replied in #issues
  Reply ID: 2025-12-12T14:35:00.123Z
```

## Dependencies

- `dot-agents` CLI (installed globally or via npm link)

## Notes

- Threads are flat (one level deep) - replies to replies go in the same thread
- Message ID must exist in the channel
- Replies are append-only (no editing)
