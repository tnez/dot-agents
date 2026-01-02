# dot-agents

A framework for building and running agentic workflows with personas and scheduled execution.

## What is dot-agents?

dot-agents lets you define **personas** (agent configurations) and **workflows** (tasks for agents to execute), then run them on-demand or on a schedule. It's designed to work with any agent CLI (Claude Code, local LLMs, etc.).

**Key features:**

- **Personas** with cascading inheritance - define base configurations and extend them
- **Workflows** with triggers - run on-demand, on cron schedules, or via webhooks
- **Daemon** for background execution - scheduled workflows run automatically
- **Agent-agnostic** - works with any CLI that accepts prompts via stdin

## Installation

Requires Node.js 20+.

No installation required - use `npx` to run directly:

```bash
npx dot-agents init
npx dot-agents run my-workflow
```

Or install globally:

```bash
npm install -g dot-agents
```

## Quick Start

```bash
# Initialize a new project
npx dot-agents init

# Run the sample workflow
npx dot-agents run hello-world
```

That's it! The `init` command creates:

- `.agents/personas/claude/PERSONA.md` - Default Claude persona
- `.agents/workflows/hello/WORKFLOW.md` - Sample hello-world workflow

### Directory Discovery

dot-agents searches for `.agents/` in these locations (in order):

1. Current directory and ancestors (walks up the tree)
2. Home directory (`~/.agents/`)

This means you can run `dot-agents` from any subdirectory of a project.

## Manual Setup

If you prefer to set up manually (or want to understand the structure):

### 1. Create directories

```bash
mkdir -p .agents/personas/claude .agents/workflows/hello
```

### 2. Define a persona

Create `.agents/personas/claude/PERSONA.md`:

```markdown
---
name: claude
description: Base Claude persona
cmd: "claude --print" # Or array for fallbacks: ["claude --print", "claude -p"]
env:
  CLAUDE_MODEL: sonnet
---

You are a helpful assistant. Execute tasks thoroughly and report results clearly.
```

### 3. Create a workflow

Create `.agents/workflows/hello/WORKFLOW.md`:

```markdown
---
name: hello-world
description: A simple hello world workflow
persona: claude
on:
  manual: true
---

Say hello and tell me today's date.
```

### 4. Run it

```bash
dot-agents run hello-world
```

### Required Fields Reference

**Persona fields:**

```yaml
---
name: my-persona # Required: unique identifier
cmd: "claude --print" # Required for root personas (can be inherited)
description: "..." # Optional but recommended
---
```

**Workflow fields:**

```yaml
---
name: my-workflow # Required: unique identifier
description: "..." # Required: human-readable description
persona: my-persona # Required: must match a persona name/path
---
```

## Core Concepts

### Mental Model

dot-agents has four core primitives that work together:

| Primitive     | Defines      | Description                            |
| ------------- | ------------ | -------------------------------------- |
| **Personas**  | HOW          | Agent configuration (cmd, env, skills) |
| **Workflows** | WHAT         | Tasks with triggers and inputs         |
| **Sessions**  | WHERE        | Execution context with state           |
| **Channels**  | COORDINATION | Messaging between sessions             |

**Typical flows:**

- `personas run developer` - Create session, run persona interactively
- `run daily-standup` - Create session, execute workflow task
- `channels publish @dev "..."` - Queue message for async persona invocation
- Daemon watches channels, creates sessions when messages arrive

### Directory Structure

```text
.agents/
├── personas/           # Agent configurations
│   └── claude/
│       ├── PERSONA.md  # Base Claude persona
│       └── autonomous/
│           ├── PERSONA.md  # Inherits from claude
│           └── productivity/
│               └── PERSONA.md  # Inherits from autonomous
├── workflows/          # Task definitions
│   └── daily-standup/
│       └── WORKFLOW.md
├── skills/             # Reusable capabilities (optional)
├── channels/           # Message storage
└── sessions/           # Execution logs
```

### Personas

Personas define **how** an agent behaves. They specify the command to run, environment variables, available skills, and a system prompt.

```yaml
---
name: productivity-assistant
description: Focused assistant for productivity tasks
cmd: "claude --print"
env:
  CLAUDE_MODEL: sonnet
skills:
  - "productivity/**"
  - "!productivity/experimental/*"
---
System prompt goes here in the markdown body...
```

**Command formats:** The `cmd` field supports three formats:

```yaml
# String - single command
cmd: "claude --print"

# Array - fallback alternatives (tries first, falls back to second, etc.)
cmd:
  - "claude --print"
  - "claude -p"

# Object - mode-specific commands
cmd:
  headless: ["claude", "--print"]      # Used with --headless flag
  interactive: ["claude"]              # Used with TTY or --interactive flag
```

**Persona inheritance:** Personas cascade through directories. A persona at `personas/claude/autonomous/productivity/` inherits from `personas/claude/autonomous/` which inherits from `personas/claude/`.

- Scalar fields (name, description, cmd) - child overrides parent
- Objects (env) - deep merged
- Arrays (skills) - merged with `!` prefix for removal

### Workflows

Workflows define **what** an agent should do. They reference a persona and contain the task in the markdown body.

```yaml
---
name: daily-standup
description: Generate standup notes from git activity
persona: claude/autonomous
on:
  schedule:
    - cron: "0 9 * * 1-5"
  manual: true
inputs:
  - name: days
    type: number
    default: 1
    description: Days of history to analyze
---

Analyze git commits from the last ${days} day(s) and generate standup notes.
Focus on: what was accomplished, what's in progress, any blockers.
```

**Triggers:**

- `manual: true` - Can be run on-demand
- `schedule` - Cron-based scheduling (requires daemon)
- `channel` - Trigger on channel messages (requires daemon)
- Planned: `file_change`, `webhook`, `git`

### Variable Expansion

Workflows support variable expansion in the task body:

- `${VAR}` - Environment variables and inputs
- `${DATE}`, `${TIME}`, `${DATETIME}` - Current date/time
- `${RUN_ID}` - Unique execution identifier
- `{{#if var}}...{{/if}}` - Conditional blocks

## CLI Reference

```bash
dot-agents [command]

Commands:
  init                     Initialize or migrate a .agents directory
  check [type]             Validate workflows and personas
  run <workflow>           Run a workflow
  list [workflows|personas] List resources
  show workflow <name>     Show workflow details
  show persona <name>      Show resolved persona (with inheritance)
  schedule list            List scheduled workflows
  daemon run               Run the scheduler daemon
  daemon status            Check daemon status
  daemon jobs              List scheduled jobs
  daemon trigger <name>    Manually trigger a workflow
  channels list            List all channels
  channels publish         Publish a message to a channel
  channels read            Read messages from a channel
  channels reply           Reply to a message thread
  channels process         Process pending DM messages (one-shot)
  personas run <name>      Run a persona interactively or headless
  projects list            List registered projects
  projects add <name>      Register a project for cross-project routing
  projects remove <name>   Unregister a project

Aliases:
  workflows                List all workflows (alias for 'list workflows')
```

### Running Workflows

```bash
# Run a workflow
dot-agents run daily-standup

# With input overrides
dot-agents run daily-standup -i days=3

# Dry run (show prompt without executing)
dot-agents run daily-standup --dry-run

# Override persona
dot-agents run daily-standup -p claude/autonomous
```

### Viewing Details

```bash
# Show resolved persona with full inheritance chain
dot-agents show persona claude/autonomous/productivity

# Show workflow with resolved prompt
dot-agents show workflow daily-standup --prompt
```

### Validating Configuration

The `check` command validates your workflows and personas, catching common issues like:

- Missing required fields (`name`, `description`, `persona`)
- Invalid trigger configurations (wrong `schedule` format)
- Unknown fields (suggesting correct alternatives)
- Invalid cron expressions
- Missing persona references

```bash
# Check everything
dot-agents check

# Check only workflows
dot-agents check workflows

# Check only personas
dot-agents check personas

# JSON output (for CI/scripts)
dot-agents check --json
```

Example output:

```text
Checking workflows...
  ✓ hello-world
  ○ daily-standup
    ⚠ warning: Unknown field 'schedule' [schedule]
      hint: Did you mean 'on.schedule'?
  ✗ broken-workflow
    ✗ error: Missing required 'persona' field
      hint: Add: persona: claude

Summary:
  Workflows: 2/3 valid
```

## Daemon

The daemon runs scheduled workflows in the background based on cron expressions.

### Running the Daemon

```bash
# Start in foreground (Ctrl+C to stop)
cd /path/to/project  # Must contain .agents/
dot-agents daemon run

# Custom port
dot-agents daemon run -p 8080

# Disable file watching
dot-agents daemon run --no-watch
```

> **⚠️ Important:** The daemon must be run from a directory containing `.agents/` (or a subdirectory of one).

### Managing the Daemon

```bash
# Check if daemon is running
dot-agents daemon status

# View scheduled jobs and next run times
dot-agents daemon jobs

# Manually trigger a workflow
dot-agents daemon trigger my-workflow

# Reload workflows after editing files
dot-agents daemon reload
```

### HTTP API

The daemon exposes an HTTP API on port 3141 (configurable with `-p`):

- `GET /health` - Health check
- `GET /status` - Daemon status and uptime
- `GET /jobs` - List scheduled jobs
- `POST /trigger/:workflow` - Trigger a workflow
- `POST /reload` - Reload workflows from disk

### Deploying on macOS (launchd)

For an always-on Mac server, use launchd to keep the daemon running:

1. Create a plist file at `~/Library/LaunchAgents/com.dot-agents.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.dot-agents.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npx</string>
        <string>dot-agents</string>
        <string>daemon</string>
        <string>run</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/Documents</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/dot-agents.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/dot-agents.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

2. Update the `WorkingDirectory` to point to your `.agents/` location.

3. Load and start the daemon:

```bash
# Load the service
launchctl load ~/Library/LaunchAgents/com.dot-agents.daemon.plist

# Check status
launchctl list | grep dot-agents

# View logs
tail -f /tmp/dot-agents.out.log

# Stop and unload
launchctl unload ~/Library/LaunchAgents/com.dot-agents.daemon.plist
```

### Workflow Schedule Format

For workflows to be scheduled, they need `on.schedule` with cron expressions:

```yaml
---
name: daily-report
description: Generate daily report
persona: claude
on:
  schedule:
    - cron: "0 9 * * *" # 9:00 AM daily
    - cron: "0 17 * * 1-5" # 5:00 PM weekdays
  manual: true # Also allow manual triggers
---
```

Common cron patterns:

| Pattern       | Description         |
| ------------- | ------------------- |
| `0 9 * * *`   | Daily at 9:00 AM    |
| `30 6 * * *`  | Daily at 6:30 AM    |
| `0 */3 * * *` | Every 3 hours       |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 0 1 * *`   | First of each month |

Use `dot-agents check` to validate your cron expressions.

## Channels

Channels enable messaging between sessions, personas, and projects. They're the coordination backbone for async agent communication.

### Channel Types

| Prefix | Type           | Purpose                          |
| ------ | -------------- | -------------------------------- |
| `@`    | Direct Message | Private inbox for a persona      |
| `#`    | Public Channel | Shared topic-based communication |

### CLI Commands

```bash
# List all channels
dot-agents channels list

# Publish to a channel
dot-agents channels publish "#status" "Deployment complete"

# Publish to a persona's DM (triggers persona via daemon)
dot-agents channels publish "@developer" "Please review PR #123"

# Read recent messages
dot-agents channels read "#status"
dot-agents channels read "#status" --since 24h --limit 20

# Read a specific thread
dot-agents channels read "#status" --thread <thread-id>

# Reply to a message
dot-agents channels reply "#status" <message-id> "Acknowledged"
```

### Cross-Project Communication

Routes messages to other registered dot-agents projects using `project/` prefix:

```bash
# Publish to another project's entry persona (@project routes to root persona)
dot-agents channels publish "@other-project" "Handle this task"

# Publish to a specific persona in another project
dot-agents channels publish "@other-project/developer" "Review this PR"

# Read from another project's public channel
dot-agents channels read "#other-project/status" --since 24h
```

**Syntax patterns:**

- `@project` - Routes to project's root persona (entry point)
- `@project/persona` - Routes to specific persona in project
- `#project/channel` - Routes to public channel in project

Register projects first with `dot-agents projects add <name> <path>`. See [Projects](#projects) section.

### Daemon Integration

When the daemon is running:

- Messages to `@persona` automatically invoke that persona
- The persona receives the message content as input
- Enables fire-and-forget async delegation

```bash
# This triggers the developer persona asynchronously
dot-agents channels publish "@developer" "Fix the login bug"
```

## Sessions

Sessions are execution units that capture agent work. Every `personas run` creates a session.

### Session Basics

```bash
# Run a persona (creates session automatically)
dot-agents personas run developer

# Run with initial prompt
dot-agents personas run developer --prompt "Fix the bug in auth.ts"

# Resume a previous session
dot-agents personas run developer --session-id 2025-12-23T15-30-45
```

### Session Environment

Running agents receive these environment variables:

| Variable      | Example                                 | Purpose                |
| ------------- | --------------------------------------- | ---------------------- |
| `SESSION_DIR` | `.agents/sessions/2025-12-23T15-30-45/` | Session directory path |
| `SESSION_ID`  | `2025-12-23T15-30-45`                   | Session identifier     |

Agents should write a `session.md` summary to `$SESSION_DIR` before exiting to enable resumption and handoff.

### Session Lifecycle

1. **Create** - `personas run` creates session directory and sets env vars
2. **Execute** - Agent runs with full context (persona + session history)
3. **Log** - Agent writes `session.md` summary to preserve state
4. **Resume** - `--session-id` reloads context for continuation

## Projects

Projects enable cross-project communication by registering other dot-agents installations.

### Managing Projects

```bash
# List registered projects
dot-agents projects list

# Register a project
dot-agents projects add my-docs /path/to/docs-project

# Remove a project
dot-agents projects remove my-docs
```

### Using Registered Projects

Once registered, you can communicate with other projects via channels:

```bash
# Send task to another project's entry persona
dot-agents channels publish "@my-docs" "Update the API reference"

# Send to specific persona in another project
dot-agents channels publish "@my-docs/writer" "Draft release notes"

# Read from another project's channel
dot-agents channels read "#my-docs/updates"
```

Projects are stored in `~/.dot-agents/projects.json`.

## Skills

dot-agents also supports skills - focused, reusable capabilities that agents can load. Skills follow the [Anthropic Skills Specification](https://github.com/anthropics/skills/blob/main/agent_skills_spec.md).

Skills are referenced in personas via glob patterns:

```yaml
skills:
  - "documents/**"
  - "productivity/*"
  - "!experimental/**"
```

See the `skills/` directory for examples.

## Development

```bash
# Clone and install
git clone https://github.com/tnez/dot-agents.git
cd dot-agents
npm install

# Build
npm run build

# Run CLI locally
just cli list workflows

# Run linters
just lint
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
