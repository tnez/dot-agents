# Agent Skills

A curated collection of agent skills for Claude, focusing on meta-skills for skill development and quality assurance.

## What are Agent Skills?

Skills are folders of instructions, scripts, and resources that Claude loads dynamically to improve performance on specialized tasks. They function as "onboarding guides" that transform Claude into specialized agents by bundling procedural knowledge, workflows, and tool integrations.

Each skill is a self-contained directory with:

- `SKILL.md` - Required markdown file with YAML frontmatter and instructions
- Optional supporting files (scripts, templates, assets, references)

## Repository Structure

```text
agent-skills/
├── meta/                  # Meta-skills for skill development
│   ├── skill-creator/     # Create and scaffold new skills
│   ├── skill-tester/      # Test and validate skills
│   └── skill-evaluator/   # Evaluate skill quality
└── examples/              # Example domain skills
    └── simple-task/       # Minimal reference implementation
```

## Quick Start

### For Agents

Skills are loaded automatically when relevant to your task. Each skill provides:

- Clear instructions for when and how to use it
- Templates and examples
- Validation and testing tools

### For Humans

1. **Browse skills**: Explore `meta/` and `examples/` directories
2. **Use meta-skills**: Leverage skill-creator, skill-tester, and skill-evaluator
3. **Create custom skills**: Follow the [Agent Skills Specification](https://github.com/anthropics/skills/blob/main/agent_skills_spec.md)
4. **See workflows**: Check [WORKFLOWS.md](/Users/tnez/Code/tnez/agent-skills/main/WORKFLOWS.md) for examples

## Meta-Skills

### skill-creator

Scaffold new skills with proper structure and validation. Generates:

- SKILL.md with valid YAML frontmatter
- Directory structure (scripts, templates, assets)
- Validation checks for spec compliance

### skill-tester

Validate skills against the specification. Tests:

- YAML frontmatter correctness
- File references and structure
- Common issues and anti-patterns

### skill-evaluator

Assess skill quality using rubric-based evaluation. Evaluates:

- Clarity and actionability
- Completeness and focus
- Examples and documentation quality

## Skill Format

Every skill requires `SKILL.md` with this structure:

```markdown
---
name: skill-name
description: Clear explanation of what the skill does and when Claude should use it
license: MIT
---

# Skill Instructions

Imperative instructions for Claude to follow...
```

**Requirements**:

- Skill directory name must match `name` field exactly
- Use hyphen-case for skill names
- Keep description clear (~200 characters)
- Explain both WHAT the skill does AND WHEN to use it

## Contributing

When creating new skills:

1. Use `skill-creator` to scaffold the structure
2. Test with `skill-tester` to ensure spec compliance
3. Evaluate with `skill-evaluator` for quality assurance
4. Follow the test → evaluate → refine cycle

## Resources

- [Agent Skills Specification](https://github.com/anthropics/skills/blob/main/agent_skills_spec.md)
- [Anthropics Skills Repository](https://github.com/anthropics/skills)
- [Workflows Documentation](/Users/tnez/Code/tnez/agent-skills/main/WORKFLOWS.md)

## License

MIT
