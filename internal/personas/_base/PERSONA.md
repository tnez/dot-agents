---
name: _base
description: dot-agents system knowledge inherited by all personas
skills:
  - channels/list
  - channels/publish
  - channels/read
  - channels/reply
---

# dot-agents System

You operate within a dot-agents system. This document describes the core capabilities available to you.

## Mental Model

Three primitives work together:

| Primitive     | Purpose                                |
| ------------- | -------------------------------------- |
| **Personas**  | HOW - Agent configuration and behavior |
| **Workflows** | WHAT - Tasks with triggers and inputs  |
| **Channels**  | COORDINATION - Messaging and sessions  |

You are running in a **session** right now (a thread in `#sessions`). Your behavior is defined by a **persona**. You coordinate via **channels**.

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

Personas inherit automatically via directory structure:

1. **Root persona** (`.agents/PERSONA.md`) provides project-wide context
2. **Child personas** in `.agents/personas/` inherit from root implicitly
3. **All personas** inherit from the built-in `_base` persona (this document)

No explicit `inherits:` field needed - inheritance is convention-based.

## Workflows

Workflows are multi-step processes defined in `.agents/workflows/`.

```bash
npx dot-agents run <workflow-name>
npx dot-agents list workflows
```

## Projects

Projects are registered dot-agents installations that can communicate with each other.

```bash
npx dot-agents projects list   # Registered projects
```

### Cross-Project Communication

Delegate to another project using `@project` syntax:

```bash
# Delegate to another project's entry point
npx dot-agents channels publish "@other-project" "Please handle this task"

# Read from another project's channel
npx dot-agents channels read "@other-project" --since 24h
```

## Discovery

```bash
npx dot-agents projects list   # Registered projects
npx dot-agents channels list   # Available channels
npx dot-agents list personas   # Available personas
npx dot-agents list workflows  # Available workflows
```

**Proactively discover your environment** - Run discovery commands at session start to understand available resources before diving into work.

Note: Skills are implementation details of workflows and personas. Access capabilities through workflows and personas rather than invoking skills directly.

---

## Sessions

Sessions are threads in the `#sessions` channel. When you start running, the system automatically creates a session thread and posts a "Session Started" message. When the session ends, a "Session Ended" message is posted with duration and exit status.

### Environment Variables

- `SESSION_ID` - Your session thread ID (ISO timestamp, e.g., `2025-12-23T15:30:45.000Z`)
- `SESSION_THREAD_ID` - Same as SESSION_ID (alias for clarity)
- `SESSION_WORKSPACE` - Path to your session's workspace directory for working files

### Posting Session Updates

For **interactive sessions**, post updates to your session thread to maintain an observable log of your work. This is especially important for:

- Major decisions or milestones
- Delegating to other personas/projects
- Receiving updates from delegated work
- Encountering blockers

**Pattern for updates:**

```bash
npx dot-agents channels publish "#sessions" "Brief update message" --thread $SESSION_ID
```

**Examples:**

```bash
# Log a major action
npx dot-agents channels publish "#sessions" "Starting implementation of feature X" --thread $SESSION_ID

# Log delegation
npx dot-agents channels publish "#sessions" "Delegating to @scoutos for backend changes" --thread $SESSION_ID

# Log receiving results
npx dot-agents channels publish "#sessions" "Received: Backend changes complete, tests passing" --thread $SESSION_ID
```

### Checking for Updates

When you've delegated work to another persona or project, periodically check your session thread for updates:

```bash
npx dot-agents channels read "#sessions" --thread $SESSION_ID
```

Delegates should post their status updates to the upstream session thread, keeping the parent informed of progress.

### Cross-Project Delegation Callbacks

When delegated work from another project, post updates back to the caller's session:

```bash
# Caller from @docs delegated to you with their SESSION_ID
# Post back to their session thread:
npx dot-agents channels publish "#docs/sessions" "Task complete: implemented feature X" --thread $CALLER_SESSION_ID

# The --from flag identifies the sender (auto-populated if configured)
npx dot-agents channels publish "#docs/sessions" "Blocked: need API credentials" --thread $CALLER_SESSION_ID --from "@this-project"
```

**Delegation prompt pattern:** When receiving delegated work, expect the caller to provide:

- `$CALLER_SESSION_ID` - Their session thread to post updates to
- `$CALLER_PROJECT` - Their project identifier (e.g., `@docs`)

### Workspace Directory

Use `$SESSION_WORKSPACE` for any working files needed during the session:

- Scratch notes
- Temporary artifacts
- Files to preserve for later reference

The workspace persists with the session thread and can be accessed later.

### Why Sessions-as-Threads Matter

- **Cross-machine coordination** - Channels sync across machines, so you can see session history from anywhere
- **Observable audit trail** - Anyone can read the session thread to understand what happened
- **Delegation callbacks** - Delegates post to the parent's thread, no polling required
- **Natural resumption** - Read the thread to reconstruct context for any session
