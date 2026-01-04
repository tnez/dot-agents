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

### Multi-Participant Session Threads

**Validated:** 2026-01-04 - Multiple personas can post to a single session thread for observable orchestration.

**The pattern:** When root delegates to internal personas (@developer, @reviewer), pass callback instructions in the prompt so they post to root's session thread instead of creating their own.

**How it works:**

1. Root starts session, has `$SESSION_ID`
2. Root posts "delegating to @developer" to its thread
3. Root invokes developer with callback instructions embedded in prompt
4. Developer posts updates to root's thread (via callback instructions)
5. Developer completes, root continues to reviewer
6. Same pattern for reviewer
7. Single thread shows full audit trail with multiple participants

**Callback instructions template:**

```markdown
## Callback Instructions

You are working as part of a coordinated session. Post your status updates to the parent session thread:

\`\`\`bash
npx dot-agents channels publish "#sessions" "YOUR_UPDATE" --thread "<SESSION_ID>" --from "<persona-name>"
\`\`\`

Post an update when:

1. Starting work
2. Work complete (include files changed)
   \`\`\`
```

**Result:** Observable session thread like:

```text
├── root: "Received task. Checking requirements..."
├── root: "Requirements validated. Delegating to @developer"
├── developer: "Starting work..."
├── developer: "Work complete. Files changed: X, Y, Z"
├── root: "Delegating to @reviewer for review"
├── reviewer: "Review complete ✓ Verdict: approved"
├── root: "All gates passed. Task complete."
```

**Limitation:** This is prompt-based until a `--callback` flag is added to `personas run`. Internal personas still create their own sessions (wasted), but post to parent thread.

**Future:** Add `--callback "#sessions:$SESSION_ID"` flag that sets `CALLBACK_ADDRESS` env var and suppresses child session creation.

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
