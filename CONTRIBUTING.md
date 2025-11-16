# Contributing to Agent Skills

## Commit Message Format

This repository follows [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```text
type(scope): description

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring (no feat/fix)
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (no src/test changes)

### Scopes

Scopes help identify which part of the repository is affected:

- `skills/meta` - Meta-skills (skill-creator, skill-tester, skill-evaluator, install-skill)
- `skills/examples` - Example skills (get-weather, simple-task, etc.)
- `ci` - CI/CD configuration and workflows
- `hooks` - Git hooks

Multiple scopes can be specified with commas:

```text
feat(skills/examples,skills/meta): add multiple new skills
```

Scope is optional for repository-wide changes:

```text
chore: update dependencies
```

### Examples

**Good commits:**

```text
feat(skills/meta): add install-skill meta-skill
fix(hooks): correct conventional commits validation regex
docs: add contributing guidelines
chore(ci): update GitHub Actions workflow
feat(skills/examples): add weather fetching skill
refactor(skills/meta): simplify skill validation logic
```

**Bad commits:**

```text
Add new skill                    # Missing type
feat: Add new skill              # Capital letter in description
feat(Skills): add skill          # Capital letter in scope
fix added bug                    # Missing colon after type
```

### Body and Footer

The body should provide additional context about the changes. Use the body to explain:

- What changed
- Why the change was needed
- Any breaking changes or important notes

Breaking changes should be indicated in the footer:

```text
feat(skills/meta): change skill validation API

The validation function now requires a config object instead of
individual parameters.

BREAKING CHANGE: ValidationOptions must now be passed as an object
```

### Validation

Commit messages are automatically validated by the `commit-msg` git hook. The hook will reject commits that don't follow the Conventional Commits format.

To test your commit message:

```bash
echo "feat(skills/meta): add new skill" | ./_hooks/commit-msg /dev/stdin
```

### Tips

- Keep the subject line under 72 characters
- Use lowercase for type, scope, and description
- Use imperative mood ("add" not "adds" or "added")
- Don't end the subject line with a period
- Separate subject from body with a blank line
- Wrap the body at 72 characters
