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

### Sessions as Threads

Sessions are threads in the `#sessions` channel, not separate directories.

**Env vars exposed to agents:**

- `SESSION_ID` / `SESSION_THREAD_ID` - Thread ID in `#sessions`
- `SESSION_WORKSPACE` - Scratch directory for session files
- `FROM_ADDRESS` - Full callback address (e.g., `#project/sessions:thread-id`)

**Pattern:** Post updates to session thread for observability:

```bash
npx dot-agents channels publish "#sessions" "Status update" --thread $SESSION_ID
```

**Legacy:** Old `.agents/sessions/` directories still readable for backward compatibility.

---

## Current Capabilities (MVD)

- **`npx dot-agents personas run <name>`** - Direct persona invocation with session creation
- **Root persona pattern** - `.agents/PERSONA.md` is implicit entry point
- **Sessions as threads** - Sessions are threads in `#sessions` channel
- **Environment discovery** - Agents automatically see available personas, workflows, channels at startup
- **Channels** - File-based messaging (`@persona` DMs, `#public` channels)
- **`channels process`** - One-shot processing for DM channels without daemon
- **Daemon** - Watches channels, invokes personas on DM, triggers workflows
- **Cross-project routing** - `@project` routes to entry point, `#project/channel` for public channels
- **Delegation callbacks** - `FROM_ADDRESS` env var enables reply-to-caller pattern
- **Activity checkpointing** - Reminds agent to write session summary after 5min inactivity

---

## Known Limitations

- **Only works with Claude Code** - Framework hardcoded for `claude` CLI. Blocked by Agent Adapter Pattern (see ROADMAP.md).

---

Last updated: 2026-01-03
