# dot-agents - Task Runner
# Run `just --list` to see all available commands

# Default recipe to display help
default:
    @just --list

# Install dependencies
install:
    npm install

# Build all packages
build:
    npm run build

# Build and watch for changes
dev:
    npm run dev

# Run the dot-agents CLI
cli *args:
    node dist/cli/index.js {{args}}

# Clean build artifacts
clean-build:
    npm run clean

# Run all linters
lint: lint-markdown lint-prettier

# Lint markdown files
lint-markdown:
    markdownlint '**/*.md' --ignore node_modules

# Check formatting with prettier
lint-prettier:
    prettier --check '**/*.{md,json,yml,yaml}'

# Lint only staged files (for pre-commit)
lint-staged:
    #!/usr/bin/env bash
    set -e

    # Get staged markdown files
    staged_md=$(git diff --cached --name-only --diff-filter=ACM | grep '\.md$' || true)
    if [ -n "$staged_md" ]; then
        echo "Linting staged markdown files..."
        echo "$staged_md" | xargs markdownlint
    fi

    # Get staged files for prettier
    staged_files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(md|json|yml|yaml)$' || true)
    if [ -n "$staged_files" ]; then
        echo "Checking staged file formatting..."
        echo "$staged_files" | xargs prettier --check
    fi

    echo "✓ Staged files look good"

# Fix markdown lint issues (where possible)
fix-markdown:
    markdownlint '**/*.md' --ignore node_modules --fix

# Auto-format files with prettier
format:
    prettier --write '**/*.{md,json,yml,yaml}'

# Run all pre-commit checks (same as git hook)
pre-commit: lint-staged

# Run skill-tester on a specific skill
test-skill skill:
    python meta/skill-tester/scripts/test.py examples/{{skill}}

# Run skill-evaluator on a specific skill
eval-skill skill:
    python meta/skill-evaluator/scripts/evaluate.py examples/{{skill}}

# Create a new skill
create-skill name:
    python meta/skill-creator/scripts/create.py {{name}}

# Install a skill from another repository
install-skill url:
    python meta/install-skill/scripts/install.py {{url}}

# Run all checks (lint + test all skills)
check: lint
    @echo "Running tests on all example skills..."
    @for skill in examples/*/; do \
        echo "Testing $${skill}..."; \
        python meta/skill-tester/scripts/test.py "$$skill" || exit 1; \
    done
    @echo "All checks passed!"

# Clean up generated files
clean:
    find . -type f -name '*.pyc' -delete
    find . -type d -name '__pycache__' -delete
    find . -type d -name '.pytest_cache' -delete
