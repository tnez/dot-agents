# dot-agents Vision

This document defines who dot-agents is for, what problems it solves, and the principles that guide its development. Any agent or human working on this project should read this first.

## TL;DR

dot-agents is a lab for growing agents. It's for developers who want to experiment with agentic systems, own their automation, and build something they're excited to share. It's file-based, shell-native, provider-agnostic, and local-first. It optimizes for DX, composability, and emergent behavior over features, polish, or mass adoption.

---

## Target User

Developers transitioning to agentic systems. They're terminal-native, appreciate good DX (think NextJS), and want to experiment with AI-powered automation.

**Characteristics:**

- Comfortable in the shell, familiar with CLI workflows
- Already using tools like Claude Code, Gemini CLI, Codex, Open Code
- Want to bring their own AI provider - mix and match cloud and local models
- Solo hackers for now - running homelabs, automating dev workflows, building second brains

**The vibe:** Someone with a spare machine who wants to run agentic automation and share what they built. Think Tasker community energy - enthusiasts building creative automations and sharing them.

---

## Core Problems

### Pain points addressed

- **Context doesn't persist** - Sessions are isolated, knowledge is lost
- **No modular expression** - Hard to decompose agentic work into reusable pieces (personas, workflows, skills)
- **CLI-bound** - Agents only work when human is watching

### Capabilities unlocked

- Scheduled workflows (CRON-driven automation)
- Automated review of sessions
- Self-healing behavior
- Agents that collaborate asynchronously

### Origin

Building a second brain system that could maintain itself.

### Aha moment

Watching agents message back-and-forth in threads, collaboratively solving problems - context self-organizing across subsystems.

---

## Goals

### Developer Experience

- One command to start (`npx dot-agents init`), then just edit files
- Use dot-agents itself to help extend dot-agents
- Composability is core - small pieces unlock emergent capabilities
- Transparency for humans AND agents (both need to see what's happening)
- Full ownership - your data, your config, your agents

### What people should say

- "It's fun to hack on"
- "You can make whatever you want"
- "It exhibits emergent behavior"
- "It's like a lab for growing agents"

---

## Non-Goals

### Won't do (for now)

- Integrations outside the shell (no GUI, no web dashboard)
- Cloud deployment - this is local-first
- Serve non-technical users

### Not competing with

- **Claude Code (or other CLI agents)** - we're a framework _for_ tools like Claude Code, not a replacement
- **Slack** - we're not a chat product
- **Perplexity** - we're not a search/answer product
- **Zapier** - we're not a no-code automation product

### What would feel off-brand

- Anything that moves source of truth away from plain-text files
- Anything that doesn't feel like configuration-as-code

---

## Architectural Values

### Files over databases

- Default to files unless you absolutely need fast search
- Must be distributable via simple file sync (rsync, git, Syncthing)

### Convention over configuration

- If a user asked for it → make it configurable
- If guessing → choose convention

### Simplicity with acceptable surprise

- Rails/NextJS balance - batteries-included where it reduces friction
- File-based routing, inheritance expressed in file tree, co-location

### Boring dependencies

- Writing code is cheap - generate more code rather than take on risky deps
- Stable over bleeding-edge

### Local-first

- Prioritize running well locally
- Extend to cloud later (not the reverse)

---

## Tradeoffs

### Will compromise

- **Simplicity for performance** - When simple becomes too slow, optimize
- **Careful design for fast iteration** - Ship and learn, but with guardrails

### Won't compromise

- **Developer experience** - Primary concern, non-negotiable
- **Stability over features** - Unix philosophy: subcommands that do "one thing well", compose for complexity
- **Plain-text source of truth** - Files are the API

### Key tension

Fast iteration + code generation = need guardrails to prevent regression. Tests exist to enable speed, not slow it down.
