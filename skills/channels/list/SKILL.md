---
name: channels-list
description: List all available channels. Use when discovering what channels exist or checking channel metadata.
license: MIT
allowed-tools:
  - Bash
---

# Channels List

List all channels to discover available communication streams.

## When to Use This Skill

Use channels-list when you need to:

- Discover what channels exist
- Check channel metadata (creator, creation date)
- Find the right channel to publish to
- Get an overview of communication streams

## Usage

```bash
bash scripts/list.sh
```

## Output

```text
Channels (4):

  #status
    Progress updates and milestone notifications
    created by system at 2025-12-10T08:00:00.000Z

  #issues
    Problems, blockers, and errors
    created by system at 2025-12-10T08:00:00.000Z

  #decisions
    Important decisions and their rationale
    created by human:tnez at 2025-12-11T10:30:00.000Z

  @claude--autonomous
    created by human:tnez at 2025-12-12T09:00:00.000Z
```

## Examples

### Example 1: Check Available Channels

```bash
bash scripts/list.sh
```

### Example 2: Pipe to grep

```bash
bash scripts/list.sh | grep "#"
```

## Dependencies

- `dot-agents` CLI (installed globally or via npm link)

## Notes

- Channels starting with `#` are public
- Channels starting with `@` are direct messages to personas
- Empty result means no channels have been created yet
- Channels are created automatically when first message is published
