# Changelog

All notable changes to dot-agents will be documented in this file.

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
