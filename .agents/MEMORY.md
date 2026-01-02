# dot-agents Memory

Accumulated knowledge, patterns, and context for the dot-agents project.

---

## Learned Patterns

### Provider-Agnostic Principle

**Exit hooks approach failed (2025-12-24):** Attempted to use Claude-specific `--settings` flag and hook types for session logging. This violated the provider-agnostic principle - the framework should work with any agent CLI (claude, aider, goose, opencode).

**Solution: Activity-based checkpointing.** A provider-agnostic wrapper monitors stdout for activity. After 5 minutes of inactivity (no output), it sends a checkpoint reminder to stdin. Works with any agent. Implemented in `src/lib/checkpoint.ts`.

### Encapsulated Delegation

External callers delegate to a project's entry point (root persona), not internal personas. The entry point owns all internal orchestration and only messages back when work is complete or a question requires external input.

**Verified working:** documents dottie → scoutos dottie delegation pattern (2025-12-18).

### Skills Location

Canonical location for built-in skills is `internal/skills/`. The `skills/` directory at root is for user-created/installable skills and examples.

- `internal/skills/channels/` - built-in channel skills (list, publish, read, reply)
- `skills/examples/` - example skills for users
- `skills/meta/` - meta-skills (skill-creator, skill-tester, etc.)

### Session Logging

Sessions are directories created at START: `sessions/YYYY-MM-DDTHH-MM-SS/session.md`

- `SESSION_DIR` and `SESSION_ID` env vars exposed to agents
- `--session-id` flag for resuming sessions
- Resume hint shown after session ends

---

## Current Capabilities (MVD)

- **`npx dot-agents personas run <name>`** - Direct persona invocation with session creation
- **Root persona pattern** - `.agents/PERSONA.md` is implicit entry point
- **Sessions** - All execution paths create sessions (manual, cron, DM, channel-triggered)
- **Channels** - File-based messaging (`@persona` DMs, `#public` channels)
- **Daemon** - Watches channels, invokes personas on DM, triggers workflows
- **Cross-project routing** - `@project/persona` and `#project/channel` syntax
- **Activity checkpointing** - Reminds agent to write session summary after 5min inactivity

---

## Known Limitations

- **Only works with Claude Code** - Framework hardcoded for `claude` CLI. Blocked by Agent Adapter Pattern (see ROADMAP.md).

---

Last updated: 2026-01-02
