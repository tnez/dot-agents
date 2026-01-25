# Changelog

All notable changes to dot-agents will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] - 2026-01-25

### Added

- **`{PROMPT}` placeholder** - Support for argument-based agent CLIs like OpenCode
  - Use `{PROMPT}` in cmd field to pass prompt as argument instead of stdin
  - Example: `cmd: { headless: "opencode run {PROMPT}" }`
  - Works for both headless and interactive modes

### Changed

- **CLI namespace restructure** - Commands organized under resource namespaces
  - `workflows run|list|show` - Workflow management
  - `personas run|list|show` - Persona management
  - Removed top-level `run`, `list`, `show` commands

### Removed

- **`projects` command** - Cross-project routing removed from framework
  - Each project should define its own `AGENTS.md` contract
  - Simplifies CLI surface area and reduces framework coupling
  - `@persona` still routes to local persona DMs

## [0.7.3] - 2026-01-24

### Fixed

- **Channel workflow cascade prevention** - Fixed critical bug where thread replies to channel messages would re-trigger workflows, causing exponential agent spawning
  - Watcher now detects replies by checking if `thread_id` is an ISO timestamp (reply) vs UUID (new thread)
  - Added rate limiting (5/min) for channel-triggered workflows (was only protecting DM-triggered personas)

## [0.7.2] - 2026-01-24

### Fixed

- **Double-trigger prevention** - Added deduplication to prevent duplicate workflow triggers from `awaitWriteFinish` events

## [0.7.1] - 2026-01-24

### Fixed

- **Cloud-synced file handling** - Added retry logic for reading files that may not be fully synced yet

## [0.7.0] - 2026-01-24

### Added

- **Doom loop safeguards** - Protection against infinite message loops in DM processing
  - Self-reply detection: Skip messages where `from` field matches target persona
  - Rate limiting: 5 invocations per persona per minute (in-memory, resets on restart)
  - Safeguards fail open to avoid dropping legitimate messages
  - Unit tests for all safeguard scenarios

- **Delegation DX improvements** - Better cross-project delegation experience
  - Warn when publishing to a project with stopped daemon
  - `--mode` flag for `channels process` (headless/interactive)
  - Progress indicator with elapsed time during processing
  - `--verbose` flag to stream delegate output

### Changed

- **Migrated test framework** - Switched from node:test to vitest for improved testing DX

### Fixed

- **Watcher channel detection** - Fixed watcher to correctly detect channel messages

### Documentation

- Added Testing DX and Delegation DX to roadmap
- Added multi-participant session thread orchestration pattern to MEMORY.md

## [0.6.0] - 2026-01-03

### Added

- **Sessions as threads** - Sessions are now threads in `#sessions` channel instead of separate directories
  - `SESSION_ID` and `SESSION_THREAD_ID` env vars expose thread ID
  - `SESSION_WORKSPACE` provides scratch directory for session files
  - Auto-publishes session start/end messages to thread
  - Cross-machine coordination via file sync

- **Environment discovery** - Auto-inject available resources into persona prompts
  - Shows project name, registration status, and daemon status
  - Lists available personas with descriptions
  - Lists available workflows with descriptions
  - Lists available channels
  - Shows other registered projects with daemon status

- **`channels process` command** - One-shot DM processing without daemon
  - Process pending messages for a specific channel or all DM channels
  - Useful for projects that don't need always-on daemon

- **Unified @name address resolution** - Smart routing for channel addresses
  - `@name` checks registered projects first, then local personas
  - Enables natural `@project` delegation syntax
  - Projects take priority over local personas with same name

- **Cross-project delegation callbacks** - `FROM_ADDRESS` env var for reply routing
  - Automatically set when processing delegated tasks
  - Parsed into `FROM_CHANNEL` and `FROM_THREAD` for convenience
  - Enables delegates to post updates back to caller's session

- **Embedded thread ID in channel address** - Support `channel:threadId` syntax
  - `#project/sessions:threadId` routes to specific thread
  - Simplifies callback routing in delegations

- **Daemon status display** - Show running/stopped status for daemons
  - `projects list` shows daemon status for each project
  - Environment context shows daemon status for current and other projects

- **Root persona support** - `.agents/PERSONA.md` as implicit entry point
- **Formal ROADMAP.md** - Versioned release targets (next-minor, next-major, backlog)
- **Cross-project channel routing** - `@project/persona` and `#project/channel` syntax
- **Project registry** - `npx dot-agents projects add|remove|list` for cross-project routing
- **Activity-based checkpointing** - Provider-agnostic 5-min inactivity reminder
- **Workflow structure** - review, pre-release, release, pr-prep, dev-setup workflows
- **`channels/list` skill** - Added to internal skills

### Changed

- **Simplified persona hierarchy** - Convention-based inheritance, no explicit `inherits:`
- **Consolidated skills** - `internal/skills/` is now canonical location for built-in skills
- **Updated .gitignore** - Supports .agents/ check-in while protecting sensitive data
- **Migrated TODO.md** - Content moved to MEMORY.md and ROADMAP.md

### Removed

- **Claude-specific exit hooks** - Violated provider-agnostic principle (reverted)
- **Duplicate skills** - `skills/channels/` removed (canonical is `internal/skills/`)
- **`skills/documents/`** - Moved to documents project where it belongs
- **Session directories** - Replaced by sessions-as-threads model (legacy still readable)

## [0.5.0] - 2025-12-16

### Added

- **Channel Triggers** - Workflows can now trigger on channel messages
  - New `on.channel` trigger type in workflow frontmatter
  - Example: `on: { channel: { channel: "#capture" } }`
  - Daemon tracks channel triggers and invokes workflows when messages are posted
  - Watcher detects both DM (`@persona`) and public (`#channel`) messages

- **DM-Triggered Persona Invocation** - Post to `@persona` to invoke that persona
  - Messages to `@persona-name` automatically trigger the corresponding persona
  - Enables asynchronous agent-to-agent communication
  - Personas receive message content via environment variables

- **Internal Base Persona** - Shared conventions for all personas
  - `_base` persona defines channel communication patterns
  - All personas inherit standard session reporting behavior
  - Consistent message formatting across personas

- **Internal Skills** - Bundled skills for channel operations
  - `channels/publish` - Post messages to channels or DMs
  - `channels/read` - Read channel messages with filtering
  - `channels/reply` - Reply to existing messages (threads)
  - Available to all personas via `getInternalSkillsPath()`

- **Version Module** - Package info utilities
  - `getPackageInfo()` / `getPackageInfoSync()` for name and version
  - `getVersion()` / `getVersionSync()` for version string
  - Cached after first read for performance

### Changed

- **Improved Daemon Logging** - Better startup and runtime logging
  - All log messages include ISO 8601 timestamps
  - Startup shows version info: `dot-agents v0.5.0 starting...`
  - Shows channel trigger count alongside scheduled job count
  - Example: `Scheduler started with 14 scheduled jobs, 2 channel triggers`

### Fixed

- **Watcher DM Detection** - Use directory watching instead of unreliable glob patterns
  - Fixed `@*` glob pattern issues on some filesystems
  - Now watches channels directory at depth 3 for all message types

- **Interactive Mode** - Proper terminal passthrough for interactive personas
  - TTY detection works correctly in all execution contexts
  - Interactive commands receive proper stdin/stdout

## [0.4.1] - 2025-12-12

### Added

- **Interactive/Headless Command Modes** - Personas can define separate commands for different execution contexts
  - `cmd` as array: legacy headless-only behavior
  - `cmd` as object: `{ headless: [...], interactive: [...] }` for mode-specific commands
  - TTY auto-detection: automatically uses interactive mode when TTY available and persona supports it
  - `--interactive` flag: force interactive mode
  - `--batch` flag: force headless mode
  - `dot-agents show persona` displays both command modes

## [0.4.0] - 2025-12-12

### Added

- **Channels** - File-system-backed messaging for agent communication
  - `dot-agents channels list` - List all channels
  - `dot-agents channels publish` - Publish messages to channels
  - `dot-agents channels read` - Read messages from channels
  - `dot-agents channels reply` - Reply to message threads
  - Support for public channels (`#name`) and direct messages (`@persona`)
  - Auto-detection of sender identity via `DOT_AGENTS_PERSONA` env var
  - Default sender format: `human:$USER` or `agent:<persona>`

- **Channel Skills** - Agent-friendly wrappers for channel operations
  - `skills/channels/publish` - Publish skill
  - `skills/channels/read` - Read skill
  - `skills/channels/reply` - Reply skill
  - `skills/channels/list` - List skill

- **Executor Enhancement** - Sets `DOT_AGENTS_PERSONA` env var when running workflows

### Changed

- CLI command renamed from `channel` to `channels` (plural)

## [0.3.1] - 2025-12-02

- Previous release (see git history for details)
