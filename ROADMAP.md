# dot-agents Roadmap

Future features and improvements planned for dot-agents.

**Tag Legend:**

- `next-minor` - Targeting the next minor release (0.x)
- `next-major` - Targeting 1.0 release
- `backlog` - Planned but not yet scheduled
- `shipped: X.Y.Z` - Released in specified version

---

## CLI Namespace Restructuring <!-- shipped: 0.8 -->

Reorganize top-level commands under their respective namespaces for consistency and clarity.

**Structure:**

```text
dot-agents workflows run <name>
dot-agents workflows list
dot-agents workflows show <name>

dot-agents personas run <name>
dot-agents personas list
dot-agents personas show <name>

dot-agents channels list
dot-agents channels publish ...
dot-agents channels read ...
```

### Dropped `projects` command

Cross-project communication is no longer a framework concern. Each project defines its own contract via an `AGENTS.md` file (or similar) that describes how external agents should interact with it.

**Rationale:**

- Projects may use different frameworks entirely
- The "API" for a project is its documented interface, not registry metadata
- Reduces framework coupling between projects
- Simplifies the CLI surface area

---

## OpenCode Support <!-- shipped: 0.8 -->

Support for OpenCode and other argument-based agent CLIs via `{PROMPT}` placeholder.

**Solution:** Use `{PROMPT}` placeholder in cmd field to pass prompt as argument instead of stdin:

```yaml
# OpenCode persona example
cmd:
  headless: opencode run {PROMPT}
  interactive: opencode {PROMPT}

# Claude persona (default - uses stdin)
cmd:
  headless: claude --print -p
  interactive: claude
```

**How it works:**

- If `{PROMPT}` appears in the command, it's replaced with the full prompt as a separate argument
- Without `{PROMPT}`, prompt is passed via stdin (Claude default)
- Works for both headless and interactive modes

**Supported patterns:**

| Pattern                 | Behavior                    |
| ----------------------- | --------------------------- |
| `claude --print -p`     | Prompt via stdin (default)  |
| `opencode run {PROMPT}` | Prompt as argument          |
| `echo {PROMPT}`         | Testing: echoes prompt back |

**Priority:** Claude Code and OpenCode. Other CLIs (aider, goose, gemini) can use `{PROMPT}` if they accept argument-based prompts.

---

## Examples Library <!-- target: next-major -->

Curated example projects demonstrating dot-agents patterns for common use cases.

**Initial examples:**

- **Software Development** - Multi-persona setup for a codebase (developer, reviewer, planner, tester). Demonstrates: Linear/GitHub integration, code review workflows, CI coordination.
- **Personal Knowledge Management** - PARA-style second brain with inbox processing, journaling, and review workflows. Demonstrates: daemon scheduling, channel-based coordination, human escalation patterns.

**Prior art:** Generalize from working setups (scoutos, docs) - extract what works well and make it reusable.

**Goal:** New users can clone an example and have a working setup immediately.

---

## HTTP/SSE MCP Transport <!-- target: backlog -->

Extend `mcp.json` to support HTTP transport, not just stdio.

**Note:** This may be better handled at the agent adapter layer - each CLI has its own MCP configuration patterns. Revisit when adding more agent adapters.

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

---

## Channels Web UI <!-- shipped: 0.7.0 -->

Full web interface for channels with attachment support.

**Goal:** Rich channel experience accessible from any device.

**Features:**

- Web UI for browsing channels, threads, and messages
- Real-time updates via SSE
- Mobile-friendly responsive design
- Attachment/artifact support (PDFs, images, files) - _future_

**HTTP API:**

- `GET /channels` - list all channels
- `GET /channels/:name` - read messages (`?since=`, `?limit=`, `?thread=`)
- `GET /channels/:name/:messageId` - specific message + replies
- `POST /channels/:name` - publish message
- `POST /channels/:name/:messageId/reply` - reply to thread
- `GET /channels-stream` - SSE endpoint for real-time updates

**Web UI:** Access via `http://localhost:3141/ui` when daemon is running.

---

## Sessions-as-Threads <!-- shipped: 0.6.0 -->

Sessions are threads in `#sessions`. Each session gets a thread directory with messages and a `workspace/` subdirectory for scratch files.

**Structure:**

```text
.agents/channels/#sessions/
└── 2026-01-11T21:47:15.355Z/           # Thread = session
    ├── 2026-01-11T21:47:15.355Z.md     # Session start message
    └── workspace/                       # Scratch files
```

**Key env vars:** `SESSION_ID`, `SESSION_THREAD_ID`, `SESSION_WORKSPACE`

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

## Unified Channel Address Resolution <!-- shipped: 0.6.0 -->

`@name` addresses resolve to local persona DMs.

**Note:** Cross-project routing via `projects.yaml` shipped in 0.6.0 but is being **deprecated in 0.8** (see CLI Namespace Restructuring). Projects should define their own `AGENTS.md` contract instead.

---

## `channels process` Command <!-- shipped: 0.6.0 -->

One-shot trigger processing for repos without always-on daemon.

```bash
npx dot-agents channels process        # All pending
npx dot-agents channels process @dev   # Specific channel
```

**Use case:** Projects with `.agents/` that want channel workflows but don't run daemon.

---

## Thread Ownership for Active Conversations <!-- target: backlog -->

When processing a DM thread, the processor should "own" the thread and monitor for new messages.

**Current behavior:**

- `channels process` reads root message only, ignores replies
- If caller posts addendum mid-processing, it's not seen
- Addendum becomes orphaned (processed in next run, out of context)

**Proposed behavior:**

1. Processor "claims" thread on start (PID file or registry)
2. Before completing, processor checks for new messages in thread
3. If new messages exist, include them and continue
4. If another process tries to claim an active thread, it waits or skips

### DOOM LOOP Prevention

**Critical:** Without safeguards, thread monitoring creates infinite loops:

```text
1. @root processes message in thread T
2. @root replies to thread T
3. Thread T has new message → triggers processing
4. @root processes its own reply
5. @root replies again → DOOM LOOP
```

**Required safeguards:**

- **Self-reply detection** - Never process messages authored by self
- **Message attribution** - Track `from` field reliably (persona + project)
- **Max iterations** - Hard limit on processing cycles per thread (e.g., 10)
- **Conversation markers** - Explicit "conversation complete" to end monitoring
- **Cooldown period** - Minimum time between processing same thread

**Design principle:** A persona should only respond to messages from _other_ entities, never its own output.

**Workaround for now:** Post complete tasks upfront, don't use thread replies for addendums during processing.

**Discovered:** 2026-01-03 during delegation dogfooding. DOOM LOOP concerns raised 2026-01-05.

---

## Channel Subscriptions <!-- target: backlog -->

Define which persona is responsible for a channel by default, eliminating the need for explicit `@tags` on every message.

**Problem:** Currently, messages require explicit `@persona` addressing. For dedicated channels (e.g., `#support`, `#deployments`), users shouldn't need to tag - the channel's "owner" should handle it.

**Two possible approaches:**

### Option A: Channel-level ownership

Define owner in channel metadata:

```yaml
# .agents/channels/#support/channel.yaml
name: support
owner: support-agent
description: Customer support requests
```

Messages to `#support` automatically route to `@support-agent`.

### Option B: Persona-level subscriptions

Define subscriptions in persona config:

```yaml
# .agents/personas/support-agent/PERSONA.md frontmatter
name: support-agent
subscribes:
  - "#support"
  - "#feedback"
```

Persona monitors subscribed channels for new messages.

**Considerations:**

- Multiple subscribers? → Round-robin, first-available, or broadcast?
- Override behavior? → `@specific-persona` in message bypasses default?
- Subscription filters? → Only certain tags, patterns, or senders?
- Channel vs DM semantics? → DMs are inherently owned, channels are shared

**Design questions to resolve:**

1. Where does the config live - channel, persona, or both?
2. How do multiple subscribers interact?
3. Does explicit `@mention` override subscription routing?

**Discovered:** 2026-01-05 during roadmap discussion.

---

## Port Test Scripts to Workflows <!-- target: backlog -->

Convert shell test scripts to self-documenting workflows:

- `scripts/test-persona-inheritance.sh` → `.agents/workflows/test-personas/`
- `scripts/test-channels.sh` → `.agents/workflows/test-channels/`
- `scripts/test-mcp-inheritance.sh` → `.agents/workflows/test-mcp/`

**Benefits:** Dogfood the framework, self-documenting, can run via daemon.

---

## Delegation DX Improvements <!-- shipped: 0.7.0 -->

Improve developer experience for cross-project delegation based on dogfooding feedback.

**Discovered:** 2026-01-04 from @docs/dottie delegation dogfooding.

### 1. Warn on publish to stopped daemon

When publishing to `@project`, warn if target daemon is stopped:

```text
Published to @dot-agents → dot-agents@root
  Message ID: 2026-01-04T20:14:52.392Z
  ⚠️  dot-agents daemon is stopped. Run `channels process` to handle.
```

**Implementation:** Check daemon status during publish, add warning to output.

### 2. Add `--mode` flag to `channels process`

Allow specifying execution mode from CLI:

```bash
npx dot-agents channels process @root --mode headless
npx dot-agents channels process @root --mode interactive
```

**Current:** No way to control this from CLI - defaults to headless.

### 3. Processing progress indicator

Show elapsed time during long-running `channels process`:

```text
Processing pending messages...
  [@root] Processing... (2m 15s elapsed)
```

**Implementation:** Timer display during persona invocation.

### 4. Verbose delegate streaming

Option to stream delegate's work for debugging/visibility:

```bash
npx dot-agents channels process @root --verbose
```

**Implementation:** Pass through stdout/stderr from spawned persona.

---

## CLI Feedback for Channel Publish <!-- target: backlog -->

Improve CLI feedback when publishing to persona DMs.

**Current:** Fire-and-forget with minimal feedback.

**Potential:** Show confirmation, message ID, or async status indicator.

**Status:** Current behavior is acceptable for MVP. See "Delegation DX Improvements" for specific enhancements.

---

## Cross-Project Delegation Callbacks <!-- shipped: 0.6.0, deprecating: 0.8 -->

Cross-project channel syntax (`#project/channel`) and callback routing shipped in 0.6.0.

**Note:** The `projects` registry is being deprecated in 0.8. Cross-project communication will rely on each project's documented `AGENTS.md` contract rather than framework-managed routing.

---

## Testing DX Improvements <!-- shipped: 0.7.0 -->

Establish a robust test/spec setup for confident local development without running as daily driver.

**Problem:** Testing currently relies on shell scripts and running against live project structures. No isolated E2E environment exists, making it hard to validate changes without dogfooding.

### Directory Structure

```text
dot-agents/
├── tests/           # Unit tests - internal correctness, fast
│   ├── lib/
│   │   ├── channels.test.ts
│   │   ├── personas.test.ts
│   │   └── registry.test.ts
│   └── fixtures/    # Minimal mocks/stubs
│
└── specs/           # E2E specs - test like a user, slower
    ├── fixtures/    # Real project structures
    │   ├── minimal-project/
    │   ├── multi-persona/
    │   └── cross-project/
    ├── channels.spec.ts
    ├── personas.spec.ts
    └── daemon.spec.ts
```

**Mental model:** `tests/` = unit tests (fast, isolated), `specs/` = E2E (test like a user).

### CI Strategy

| Trigger                      | What Runs                       | Rationale                            |
| ---------------------------- | ------------------------------- | ------------------------------------ |
| Every push to main           | `npm test` (unit)               | Fast feedback, trunk-based           |
| PR from contributors         | `npm test` + `npm run spec`     | Full validation for external changes |
| Tag push (v*.*.\*)           | `npm test` + `npm run spec`     | Pre-release gate                     |
| Manual (`workflow_dispatch`) | Selectable: unit, spec, or both | On-demand review                     |

### Tasks

- [x] Migrate from `node:test` to Vitest (native TS, built-in coverage)
- [x] Add coverage reporting to CI
- [x] Create `tests/` directory structure (move existing `*.test.ts`)
- [x] Create `specs/` directory structure with fixture projects
- [x] Migrate shell scripts (`scripts/test-*.sh`) to TypeScript specs
- [x] Update CI workflow with spec job and `workflow_dispatch` selector
- [x] Add npm scripts for selective spec runs

### npm Scripts

```json
{
  "test": "vitest run tests/",
  "spec": "vitest run specs/",
  "spec:channels": "vitest run specs/channels.spec.ts",
  "spec:personas": "vitest run specs/personas.spec.ts",
  "test:all": "vitest run",
  "test:coverage": "vitest run --coverage"
}
```

### Selective Spec Runs

```bash
# Run specific spec file
npm run spec -- specs/channels.spec.ts

# Run specs matching pattern
npm run spec -- --testNamePattern="cross-project"

# Verbose output for review
npm run spec -- --reporter=verbose
```

---

## Machine-Scoped Execution <!-- target: backlog -->

Scope workflows and channel processors to run only on specific machines.

**Problem:** When running daemons on multiple machines (e.g., Mac Mini server + MacBook laptop) with synced `.agents/` directories, workflows execute redundantly on every machine. Need a way to designate which machine(s) should handle specific workflows.

**Use case:**

- `heimdall` (Mac Mini server) - runs scheduled workflows (morning paper, inbox processing)
- `tnez-lappy` (MacBook) - interactive sessions only, no daemon workflows
- Both machines sync `.agents/` via Syncthing/iCloud

**Proposed workflow config:**

```yaml
# .agents/workflows/publish-morning-paper/WORKFLOW.md frontmatter
name: publish-morning-paper
schedule: "0 6 * * *"
host: heimdall # Only run on this machine
```

**Proposed channel config:**

```yaml
# .agents/channels/@human/channel.yaml
name: human
processor: null # No auto-processing
host: heimdall # Only process on this machine (if processor set)
```

**Implementation options:**

1. **`host` field** - Exact hostname match (`os.hostname()`)
2. **`hosts` array** - Multiple allowed machines
3. **`host_pattern`** - Regex for flexible matching
4. **Environment variable** - `DOT_AGENTS_HOST_ROLE=server` with role-based filtering

**Daemon behavior:**

- On startup, check hostname
- Skip workflows/channels where `host` doesn't match
- Log skipped items at debug level

**CLI behavior:**

- `workflows list` - show host constraints
- `daemon status` - show which workflows are active on this host

**Discovered:** 2026-01-05 from multi-machine dogfooding.

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
