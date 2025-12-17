#!/bin/bash
set -e

# MCP Inheritance Integration Tests
# Tests mcp.json loading and merging through persona inheritance, outside-in

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="$PROJECT_ROOT/.test-mcp"
CLI="node $PROJECT_ROOT/dist/cli/index.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

cleanup() {
  rm -rf "$TEST_DIR"
  rm -rf /tmp/dot-agents-mcp/test-*
}

setup() {
  cleanup
  mkdir -p "$TEST_DIR/.agents/personas/base-persona"
  mkdir -p "$TEST_DIR/.agents/personas/child-persona"
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
  if echo "$1" | grep -qF -- "$2"; then
    echo -e "${RED}Expected output NOT to contain:${NC} '$2'"
    echo -e "${YELLOW}Actual output:${NC}"
    echo "$1"
    return 1
  else
    return 0
  fi
}

assert_file_contains() {
  if grep -q "$2" "$1" 2>/dev/null; then
    return 0
  else
    echo -e "${RED}Expected file $1 to contain:${NC} '$2'"
    echo -e "${YELLOW}File contents:${NC}"
    cat "$1" 2>/dev/null || echo "(file not found)"
    return 1
  fi
}

# Trap cleanup on exit
trap cleanup EXIT

echo "=== MCP Inheritance Integration Tests ==="
echo ""

setup

# -----------------------------------------------------------------------------
# Test 1: Persona with mcp.json loads config
# -----------------------------------------------------------------------------

echo "Test 1: Persona with mcp.json loads MCP config"

cat > "$TEST_DIR/.agents/personas/base-persona/PERSONA.md" << 'EOF'
---
name: test-base
description: Base persona with MCP
cmd:
  headless: claude --print
  interactive: claude
---

Base persona prompt.
EOF

cat > "$TEST_DIR/.agents/personas/base-persona/mcp.json" << 'EOF'
{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-fetch"]
    }
  }
}
EOF

output=$($CLI personas run base-persona -v --headless -p "test" 2>&1)

assert_contains "$output" "MCP config:" || fail "Should show MCP config path"
assert_contains "$output" "--mcp-config" || fail "Should inject --mcp-config flag"

pass "MCP config loaded and injected"

# -----------------------------------------------------------------------------
# Test 2: Persona without mcp.json works normally
# -----------------------------------------------------------------------------

echo "Test 2: Persona without mcp.json works without MCP"

rm -f "$TEST_DIR/.agents/personas/base-persona/mcp.json"

output=$($CLI personas run base-persona -v --headless -p "test" 2>&1)

assert_not_contains "$output" "MCP config:" || fail "Should NOT show MCP config when none exists"
assert_not_contains "$output" "--mcp-config" || fail "Should NOT inject --mcp-config when no config"

pass "No MCP config handled correctly"

# -----------------------------------------------------------------------------
# Test 3: Child persona inherits parent MCP config
# -----------------------------------------------------------------------------

echo "Test 3: Child persona inherits parent MCP config"

# Recreate parent mcp.json
cat > "$TEST_DIR/.agents/personas/base-persona/mcp.json" << 'EOF'
{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-fetch"]
    }
  }
}
EOF

# Create child that extends parent
cat > "$TEST_DIR/.agents/personas/child-persona/PERSONA.md" << 'EOF'
---
name: test-child
description: Child persona extending base
extends: base-persona
cmd:
  headless: claude --print
  interactive: claude
---

Child persona prompt.
EOF

output=$($CLI personas run child-persona -v --headless -p "test" 2>&1)

assert_contains "$output" "MCP config:" || fail "Child should inherit MCP config"
assert_contains "$output" "--mcp-config" || fail "Child should have --mcp-config injected"

# Check the temp file contains the inherited server
mcp_file=$(echo "$output" | grep "MCP config:" | sed 's/.*MCP config: //')
assert_file_contains "$mcp_file" "fetch" || fail "Inherited config should contain fetch server"

pass "Child inherits parent MCP config"

# -----------------------------------------------------------------------------
# Test 4: Child MCP config merges with parent (child wins on conflict)
# -----------------------------------------------------------------------------

echo "Test 4: Child MCP config merges with parent"

# Add child mcp.json with additional server
cat > "$TEST_DIR/.agents/personas/child-persona/mcp.json" << 'EOF'
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-linear"]
    }
  }
}
EOF

output=$($CLI personas run child-persona -v --headless -p "test" 2>&1)

mcp_file=$(echo "$output" | grep "MCP config:" | sed 's/.*MCP config: //')

# Should have both servers
assert_file_contains "$mcp_file" "fetch" || fail "Merged config should contain parent's fetch server"
assert_file_contains "$mcp_file" "linear" || fail "Merged config should contain child's linear server"

pass "MCP configs merge correctly"

# -----------------------------------------------------------------------------
# Test 5: Child can override parent MCP server
# -----------------------------------------------------------------------------

echo "Test 5: Child can override parent MCP server"

# Child overrides fetch with different config
cat > "$TEST_DIR/.agents/personas/child-persona/mcp.json" << 'EOF'
{
  "mcpServers": {
    "fetch": {
      "command": "node",
      "args": ["custom-fetch.js"]
    },
    "linear": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-linear"]
    }
  }
}
EOF

output=$($CLI personas run child-persona -v --headless -p "test" 2>&1)

mcp_file=$(echo "$output" | grep "MCP config:" | sed 's/.*MCP config: //')

# fetch should have child's config (custom-fetch.js), not parent's (npx)
assert_file_contains "$mcp_file" "custom-fetch.js" || fail "Child should override parent's fetch server"
assert_not_contains "$(cat "$mcp_file")" "@anthropic/mcp-fetch" || fail "Parent's fetch config should be overridden"

pass "Child overrides parent MCP server correctly"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

echo ""
echo -e "${GREEN}=== All MCP tests passed! ===${NC}"
