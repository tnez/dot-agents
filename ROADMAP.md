# dot-agents Roadmap

Future features and improvements planned for dot-agents.

**Tag Legend:**

- `next-minor` - Targeting the next minor release (0.x)
- `next-major` - Targeting 1.0 release
- `backlog` - Planned but not yet scheduled

---

## Bundled Agent CLI <!-- target: next-major -->

Ship a built-in agent CLI runner so users can run dot-agents with local LLMs without external dependencies.

**Problem:** Currently requires external CLI tools (claude, aider, etc.) which may not support local models.

**Proposed:**

- Bundle a simple agent CLI that speaks to local LLM APIs (Ollama, LM Studio, llama.cpp)
- Direct API integration without shelling out to external tools
- First-class local model support for privacy-sensitive or offline use cases

**Enables:** Running dot-agents completely locally without cloud dependencies.

---

## Examples Library <!-- target: next-major -->

Curated example projects demonstrating dot-agents patterns for common use cases.

**Initial examples:**

- **Software Development** - Multi-persona setup for a codebase (developer, reviewer, planner, tester). Demonstrates: Linear/GitHub integration, code review workflows, CI coordination.
- **Personal Knowledge Management** - PARA-style second brain with inbox processing, journaling, and review workflows. Demonstrates: daemon scheduling, channel-based coordination, human escalation patterns.

**Prior art:** Generalize from working setups (scoutos, docs) - extract what works well and make it reusable.

**Structure:**

```text
examples/
├── software-dev/
│   ├── .agents/
│   │   ├── PERSONA.md
│   │   ├── personas/
│   │   └── workflows/
│   └── README.md
└── pkm/
    ├── .agents/
    │   ├── PERSONA.md
    │   ├── personas/
    │   └── workflows/
    └── README.md
```

**Goal:** New users can clone an example and have a working setup immediately.

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

**Target adapters for 1.0:**

- Claude Code
- OpenCode
- Aider
- Goose
- Gemini CLI
- Codex
- Bundled CLI (see above)

**CLI differences discovered:**

| CLI      | Interactive       | Headless                  | System Prompt          |
| -------- | ----------------- | ------------------------- | ---------------------- |
| claude   | `claude`          | `claude --print -p "..."` | stdin or `-p`          |
| opencode | `opencode [path]` | `opencode run [msg]`      | `--agent` / config     |
| aider    | `aider`           | `aider --message "..."`   | `--system-prompt` file |
| goose    | `goose session`   | `goose run "..."`         | config file            |

**Enables:** Support for other agents without hardcoding CLI specifics.

---

## First-Class Cross-Project Orchestration <!-- target: next-major -->

Elevate cross-project communication from "works" to "first-class citizen" with robust orchestration primitives.

**Current state:**

- Cross-project routing works (`@project/persona` syntax)
- Delegation is manual (tmux sessions, direct launches)
- No built-in callback/response handling

**1.0 Goals:**

- Automatic daemon coordination across registered projects
- Structured request/response patterns between projects
- Built-in callback routing (responses flow back to caller)
- Project health monitoring and status visibility
- Workflow orchestration spanning multiple projects

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

## Channels Web UI <!-- target: next-major -->

Full web interface for channels with attachment support.

**Goal:** Rich channel experience accessible from any device.

**Features:**

- Web UI for browsing channels, threads, and messages
- Attachment/artifact support (PDFs, images, files)
- Real-time updates via SSE or WebSocket
- Mobile-friendly responsive design

**HTTP API (foundation):**

- `GET /channels` - list all channels
- `GET /channels/:name` - read messages (`?since=`, `?limit=`)
- `GET /channels/:name/:messageId` - specific message + replies
- `POST /channels/:name` - publish message
- `POST /channels/:name/attachments` - upload attachments

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

## Unified Channel Address Resolution <!-- target: next-minor -->

Resolve `@name` addresses by checking both registered projects and local personas.

**Problem:** When publishing to `@project-name`, the user expects it to route to the registered project. Currently, cross-project routing requires explicit `@project/persona` syntax, but `@project` alone (delegating to the project's entry point) feels more natural.

**Current behavior:**

- `@persona` → local persona DM
- `@project/persona` → cross-project persona DM

**Proposed behavior:**

- `@name` → check registered projects first, then local personas (or configurable order)
- `@name` to a project → routes to that project's root/entry point
- Conflict detection in `health check` when a local persona name matches a registered project name

**Example:**

```bash
# Current (explicit)
npx dot-agents channels publish "@myproject/root" "do something"

# Proposed (natural)
npx dot-agents channels publish "@myproject" "do something"
# → resolves to registered project's entry point
```

**Implementation:**

1. `channels publish @name` checks `projects.yaml` for matching project
2. If found, routes to `@project/root` (or implicit entry point)
3. If not found, falls back to local persona lookup
4. `health check` warns on name collisions between projects and personas

**Discovered:** 2026-01-02 during cross-project delegation attempt.

---

## `channels process` Command <!-- target: next-minor -->

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

## CLI Feedback for Channel Publish <!-- target: backlog -->

Improve CLI feedback when publishing to persona DMs.

**Current:** Fire-and-forget with minimal feedback.

**Potential:** Show confirmation, message ID, or async status indicator.

**Status:** Current behavior is acceptable for MVP.

---

## Port to Bun <!-- target: backlog -->

Consider porting from Node.js to Bun for improved performance and developer experience.

**Potential benefits:**

- Faster startup and execution
- Built-in TypeScript support without compilation step
- Simplified tooling (bundler, test runner, package manager)
- Better performance for daemon and CLI operations

**Considerations:**

- Ecosystem compatibility
- Deployment complexity
- Breaking changes for existing users
