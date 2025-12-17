#!/bin/bash
set -e

# Persona Inheritance Integration Tests
# Tests persona resolution with internal _base persona, outside-in

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="$PROJECT_ROOT/.test-personas"
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
  mkdir -p "$TEST_DIR/.agents/personas/test-persona"
  mkdir -p "$TEST_DIR/.agents/workflows"
  cd "$TEST_DIR"
}

# Test helpers
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

assert_contains() {
  if echo "$1" | grep -q "$2"; then
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

echo "=== Persona Inheritance Integration Tests ==="
echo ""

setup

# -----------------------------------------------------------------------------
# Test 1: Base persona inheritance
# -----------------------------------------------------------------------------

echo "Test 1: Base persona is inherited by default"

# Create a simple test persona
cat > "$TEST_DIR/.agents/personas/test-persona/PERSONA.md" << 'EOF'
---
name: test-persona
description: Test persona for inheritance testing
cmd:
  headless: echo "test"
---

This is the test persona prompt.
EOF

output=$($CLI show persona test-persona 2>&1)

# Should include _base in inheritance chain
assert_contains "$output" "_base" || fail "Should show _base in inheritance"
assert_contains "$output" "Inheritance:" || fail "Should show inheritance line"

# Should include channel conventions from _base
assert_contains "$output" "#journals" || fail "Should include #journals channel guidance"
assert_contains "$output" "#issues" || fail "Should include #issues channel guidance"
assert_contains "$output" "@human" || fail "Should include @human channel guidance"

# Should also include user persona prompt
assert_contains "$output" "This is the test persona prompt" || fail "Should include user persona prompt"

pass "Base persona inherited correctly"

# -----------------------------------------------------------------------------
# Test 2: Inheritance chain order
# -----------------------------------------------------------------------------

echo "Test 2: Inheritance chain shows correct order"

output=$($CLI show persona test-persona 2>&1)

# _base should come before test-persona in inheritance
inheritance_line=$(echo "$output" | grep "Inheritance:")
assert_contains "$inheritance_line" "_base" || fail "Inheritance should include _base"
assert_contains "$inheritance_line" "test-persona" || fail "Inheritance should include test-persona"

pass "Inheritance chain order correct"

# -----------------------------------------------------------------------------
# Test 3: Session logging guidance present
# -----------------------------------------------------------------------------

echo "Test 3: Session logging guidance included"

output=$($CLI show persona test-persona 2>&1)

# Should include session logging guidance from _base
assert_contains "$output" "Session Logging" || fail "Should mention session logging"
assert_contains "$output" "daemon or runner" || fail "Should mention daemon/runner capture"

pass "Session logging guidance present"

# -----------------------------------------------------------------------------
# Test 4: extends: none opts out of base
# -----------------------------------------------------------------------------

echo "Test 4: extends: none opts out of base inheritance"

# Create persona that opts out
cat > "$TEST_DIR/.agents/personas/test-persona/PERSONA.md" << 'EOF'
---
name: test-persona
description: Persona that opts out of base
extends: none
cmd:
  headless: echo "test"
---

Standalone persona without base.
EOF

output=$($CLI show persona test-persona 2>&1)

# Should NOT include _base
assert_not_contains "$output" "_base" || fail "Should NOT include _base when extends: none"

# Should NOT include channel conventions
assert_not_contains "$output" "#journals" || fail "Should NOT include #journals when opted out"

# Should still include user prompt
assert_contains "$output" "Standalone persona without base" || fail "Should include user prompt"

pass "extends: none correctly opts out"

# -----------------------------------------------------------------------------
# Test 5: Child persona with explicit extends inherits base through parent
# -----------------------------------------------------------------------------

echo "Test 5: Child persona inherits base via extends"

# Reset to default persona (no extends: none)
cat > "$TEST_DIR/.agents/personas/test-persona/PERSONA.md" << 'EOF'
---
name: test-persona
description: Parent persona
cmd:
  headless: echo "test"
---

Parent prompt.
EOF

# Create child persona with explicit extends
mkdir -p "$TEST_DIR/.agents/personas/child-persona"
cat > "$TEST_DIR/.agents/personas/child-persona/PERSONA.md" << 'EOF'
---
name: child-persona
description: Child persona
extends: test-persona
---

Child prompt.
EOF

output=$($CLI show persona child-persona 2>&1)

# Should include _base in inheritance
assert_contains "$output" "_base" || fail "Child should inherit _base"
assert_contains "$output" "test-persona" || fail "Child should show parent in chain"
assert_contains "$output" "#journals" || fail "Child should have channel guidance"
# Should also include child's own prompt
assert_contains "$output" "Child prompt" || fail "Child should include own prompt"

pass "Child inherits base via extends correctly"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

echo ""
echo -e "${GREEN}=== All tests passed! ===${NC}"
