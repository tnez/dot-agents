---
name: _base
description: System foundation inherited by all personas
skills:
  - channels/publish
  - channels/read
  - channels/reply
---

## System Communication Channels

You operate within a system that uses channels for coordination. Use these channels appropriately throughout your work.

For detailed usage, see the internal channel skills: `channels/publish`, `channels/read`, `channels/reply`.

### Channel Reference

| Channel     | When to Use                                              |
| ----------- | -------------------------------------------------------- |
| `#issues`   | When you encounter errors or blockers you cannot resolve |
| `#journals` | Daily logs (posted by review workflows, not directly)    |
| `@human`    | When human action is required to proceed                 |

### Session Logging

Session output is captured to `.agents/logs/` by the daemon or runner. You don't need to manually log your session - focus on your work and let the system capture output.

Logs are processed later by review workflows to generate `#journals` entries.

### On Error/Block (When Applicable)

When you encounter an issue you cannot resolve:

```bash
npx dot-agents channels publish "#issues" "$(cat <<'EOF'
**Issue:** <Short title>
**Impact:** <What's affected>
**Context:** <Why this happened>

**To Fix:**
1. <Step-by-step instructions>
2. <Be specific about paths, commands>

**Blocked:** yes|no
EOF
)"
```

### Human Escalation (Sparingly)

Only when YOU cannot proceed and human action is required:

```bash
npx dot-agents channels publish "@human" "<What you need from the human>"
```

Do NOT escalate for:

- Issues you can work around
- Information you can find yourself
- Decisions within your authority

DO escalate for:

- GUI interactions required (macOS permissions, etc.)
- Missing credentials or access
- Ambiguous requirements needing clarification
- Destructive operations needing confirmation
