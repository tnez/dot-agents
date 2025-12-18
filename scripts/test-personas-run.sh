#!/bin/bash
set -e

# Personas Run Integration Tests
# Tests that personas run injects system prompt from PERSONA.md

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="$PROJECT_ROOT/.test-personas-run"
CLI="node $PROJECT_ROOT/dist/cli/index.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

cleanup() {
  rm -rf "$TEST_DIR"
}

setup() {
  cleanup
  mkdir -p "$TEST_DIR/.agents/personas/test-runner"
  mkdir -p "$TEST_DIR/.agents/workflows"
  cd "$TEST_DIR"
}

# Test helpers
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

assert_contains() {
  if echo "$1" | grep -qF -- "$2"; then
    return 0
  else
    echo -e "${RED}Expected output to contain:${NC} '$2'"
    echo -e "${YELLOW}Actual output:${NC}"
    echo "$1"
    return 1
  fi
}

assert_not_contains() {
  if echo "$1" | grep -q "$2"; then
    echo -e "${RED}Expected output NOT to contain:${NC} '$2'"
    echo -e "${YELLOW}Actual output:${NC}"
    echo "$1"
    return 1
  else
    return 0
  fi
}

# Trap cleanup on exit
trap cleanup EXIT

echo "=== Personas Run Integration Tests ==="
echo ""

setup

# -----------------------------------------------------------------------------
# Test 1: System prompt injection in headless mode
# -----------------------------------------------------------------------------

echo "Test 1: System prompt is injected in headless mode"

# Create a test persona with system prompt that uses cat to output stdin
cat > "$TEST_DIR/.agents/personas/test-runner/PERSONA.md" << 'EOF'
---
name: test-runner
description: Test persona for run testing
extends: none
cmd:
  headless: cat
---

SYSTEM_PROMPT_MARKER: This is the system prompt from PERSONA.md
EOF

output=$($CLI personas run test-runner --headless -p "USER_PROMPT_MARKER: This is the user prompt" 2>&1)

# Should contain system prompt
assert_contains "$output" "SYSTEM_PROMPT_MARKER" || fail "Should include system prompt marker"
assert_contains "$output" "This is the system prompt from PERSONA.md" || fail "Should include full system prompt"

# Should contain user prompt
assert_contains "$output" "USER_PROMPT_MARKER" || fail "Should include user prompt marker"
assert_contains "$output" "This is the user prompt" || fail "Should include full user prompt"

pass "System prompt injected in headless mode"

# -----------------------------------------------------------------------------
# Test 2: System prompt only (no user prompt) in headless mode
# -----------------------------------------------------------------------------

echo "Test 2: System prompt alone works in headless mode"

output=$($CLI personas run test-runner --headless 2>&1)

# Should contain system prompt even without user prompt
assert_contains "$output" "SYSTEM_PROMPT_MARKER" || fail "Should include system prompt without user prompt"

pass "System prompt works alone in headless mode"

# -----------------------------------------------------------------------------
# Test 3: Separator between system and user prompts
# -----------------------------------------------------------------------------

echo "Test 3: Separator added between system and user prompts"

output=$($CLI personas run test-runner --headless -p "USER_PROMPT" 2>&1)

# Should contain separator
assert_contains "$output" "---" || fail "Should include separator between prompts"

pass "Separator present between prompts"

# -----------------------------------------------------------------------------
# Test 4: Inherited system prompts
# -----------------------------------------------------------------------------

echo "Test 4: Inherited system prompts work correctly"

# Create parent persona
mkdir -p "$TEST_DIR/.agents/personas/parent"
cat > "$TEST_DIR/.agents/personas/parent/PERSONA.md" << 'EOF'
---
name: parent
description: Parent persona
extends: none
cmd:
  headless: cat
---

PARENT_PROMPT_MARKER: This is from parent
EOF

# Create child that extends parent
mkdir -p "$TEST_DIR/.agents/personas/child"
cat > "$TEST_DIR/.agents/personas/child/PERSONA.md" << 'EOF'
---
name: child
description: Child persona
extends: parent
---

CHILD_PROMPT_MARKER: This is from child
EOF

output=$($CLI personas run child --headless -p "USER_INPUT" 2>&1)

# Should contain both parent and child prompts
assert_contains "$output" "PARENT_PROMPT_MARKER" || fail "Should include parent prompt"
assert_contains "$output" "CHILD_PROMPT_MARKER" || fail "Should include child prompt"
assert_contains "$output" "USER_INPUT" || fail "Should include user input"

pass "Inherited prompts work correctly"

# -----------------------------------------------------------------------------
# Test 5: Verbose mode shows system prompt info
# -----------------------------------------------------------------------------

echo "Test 5: Verbose mode shows system prompt info"

output=$($CLI personas run test-runner --headless -p "test" -v 2>&1)

# Should show system prompt info in verbose output
assert_contains "$output" "System prompt:" || fail "Verbose should show system prompt info"

pass "Verbose mode shows system prompt"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

echo ""
echo -e "${GREEN}=== All tests passed! ===${NC}"
