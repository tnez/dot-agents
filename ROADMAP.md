# dot-agents Roadmap

Future features and improvements planned for dot-agents.

**Tag Legend:**

- `next-minor` - Targeting the next minor release (0.x)
- `next-major` - Targeting 1.0 release
- `backlog` - Planned but not yet scheduled

---

## Agent Adapter Pattern <!-- target: next-major -->

Personas declare agent type; adapters handle CLI specifics.

**Problem:** Currently hardcoded for `claude` CLI. MCP injection, command building, and prompt passing all assume Claude's flags. Other CLIs (opencode, aider, goose) won't work without adapters.

**Solution:**

```yaml
agent: claude
# No cmd needed - adapter knows CLI patterns
```

Each adapter implements:

- `buildInteractiveCommand(persona, prompt?)`
- `buildHeadlessCommand(persona, prompt)`
- `injectMcp(persona, mcpConfig)`

**CLI differences discovered:**

| CLI      | Interactive       | Headless                  | System Prompt          |
| -------- | ----------------- | ------------------------- | ---------------------- |
| claude   | `claude`          | `claude --print -p "..."` | stdin or `-p`          |
| opencode | `opencode [path]` | `opencode run [msg]`      | `--agent` / config     |
| aider    | `aider`           | `aider --message "..."`   | `--system-prompt` file |
| goose    | `goose session`   | `goose run "..."`         | config file            |

**Enables:** Support for other agents without hardcoding CLI specifics.

---

## Multi-Project Daemon Architecture <!-- target: next-major -->

One daemon orchestrating multiple .agents installations with encapsulated delegation.

**Current state:**

- Daemon runs in one location (e.g., ~/Documents/.agents)
- Other projects have their own .agents/ but no daemon
- Delegation is manual (tmux sessions, direct launches)

**Proposed:**

- Single daemon knows about multiple projects (via registry)
- Cross-project routing already works (`@project/persona` syntax)
- Daemon routes messages between projects automatically

**Encapsulated delegation pattern:**

```text
@documents/dottie
       │ "implement feature X"
       ▼
@scoutos/dottie ──► internal orchestration ──► result
       │ "done" or "question: ..."
       ▼
@documents/dottie
```

External callers delegate to entry points, not internal personas.

---

## HTTP/SSE MCP Transport <!-- target: next-major -->

Extend `mcp.json` to support HTTP transport, not just stdio.

**Current (stdio only):**

```json
{
  "mcpServers": {
    "example": { "command": "npx", "args": ["..."] }
  }
}
```

**Proposed (HTTP support):**

```json
{
  "mcpServers": {
    "linear": {
      "type": "http",
      "url": "https://mcp.linear.app/mcp"
    }
  }
}
```

**Enables:** Remote MCP servers (Linear, etc.) in persona configs.

---

## Channels HTTP Interface <!-- target: next-minor -->

Expose channels via HTTP for visibility from anywhere (over Tailscale VPN).

**Goal:** Read channel audit trail from any device.

**Endpoints:**

- `GET /channels` - list all channels
- `GET /channels/:name` - read messages (`?since=`, `?limit=`)
- `GET /channels/:name/:messageId` - specific message + replies
- `POST /channels/:name` - publish message (nice-to-have)

---

## Session/Channel Documentation <!-- target: next-minor -->

Clarify the unified mental model in README/docs.

**Core concepts:**

- Sessions = execution units
- Channels = messaging between sessions
- `personas run` = create session, run in foreground
- `channels publish @persona` = create message, daemon handles async

Document in README or dedicated docs section.

---

## Daemon Refactor: Use `personas run` Internally <!-- target: backlog -->

Refactor daemon to use `personas run` as underlying primitive.

**Current:** `channels publish @persona → daemon → workflow → execa(cmd)`
**Proposed:** `channels publish @persona → daemon → personas run`

**Why:**

- `personas run` already handles inheritance, MCP config, mode selection
- Avoids duplicating logic between daemon and personas run
- Cleaner mental model: channels = messaging, personas run = execution

---

## `channels process` Command <!-- target: backlog -->

One-shot trigger processing for repos without always-on daemon.

```bash
npx dot-agents channels process        # All pending
npx dot-agents channels process @dev   # Specific channel
```

**Use case:** Projects with `.agents/` that want channel workflows but don't run daemon.

---

## Port Test Scripts to Workflows <!-- target: backlog -->

Convert shell test scripts to self-documenting workflows:

- `scripts/test-persona-inheritance.sh` → `.agents/workflows/test-personas/`
- `scripts/test-channels.sh` → `.agents/workflows/test-channels/`
- `scripts/test-mcp-inheritance.sh` → `.agents/workflows/test-mcp/`

**Benefits:** Dogfood the framework, self-documenting, can run via daemon.

---

## Enhanced Cross-Project Communication <!-- target: backlog -->

Build on existing cross-project routing to improve interactive session support.

**Challenge:** What does reading look like for interactive sessions?

**Potential solution:** Bake into \_base persona prompt that agents should check their DM channel periodically. Works for both headless and interactive sessions.

---

## Structured Response Routing <!-- target: backlog -->

Add `upstream` field for structured response routing back to callers.

**Use case:** Orchestration scenarios where a caller needs to receive structured responses from delegated work.

**Status:** Nice-to-have, not blocking current functionality.

---

## CLI Feedback for Channel Publish <!-- target: backlog -->

Improve CLI feedback when publishing to persona DMs.

**Current:** Fire-and-forget with minimal feedback.

**Potential:** Show confirmation, message ID, or async status indicator.

**Status:** Current behavior is acceptable for MVP.
