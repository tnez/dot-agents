#!/bin/bash
# Session save reminder hook for dot-agents
# Runs when Claude Code's main agent finishes responding (Stop hook)
#
# Purpose: Check if session.md was updated and optionally prompt for save
#
# Environment:
#   DOT_AGENTS_SESSION_DIR - Path to session directory
#   DOT_AGENTS_SESSION_ID - Session identifier
#
# Input (stdin JSON):
#   session_id, transcript_path, stop_hook_active, etc.
#
# Output (stdout JSON):
#   decision: "approve" to allow stop, "block" to continue
#   reason: Required if decision is "block"

set -e

# Read hook input from stdin
INPUT=$(cat)

# Parse input
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')

# Get session dir from environment (set by dot-agents)
SESSION_DIR="${DOT_AGENTS_SESSION_DIR:-}"

# If this hook already ran (stop_hook_active=true), don't block again
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  echo '{"decision": "approve"}'
  exit 0
fi

# If no session directory, nothing to check
if [ -z "$SESSION_DIR" ]; then
  echo '{"decision": "approve"}'
  exit 0
fi

SESSION_MD="$SESSION_DIR/session.md"

# Check if session.md exists and has content beyond the initial metadata
if [ -f "$SESSION_MD" ]; then
  # Count lines in the file (excluding YAML frontmatter)
  # If file has content after the frontmatter, user has written a summary
  CONTENT_LINES=$(awk '/^---$/{if(++c==2)next}c==2' "$SESSION_MD" | grep -v '^$' | wc -l | tr -d ' ')

  if [ "$CONTENT_LINES" -gt 0 ]; then
    # Session has content, allow stop
    echo '{"decision": "approve"}'
    exit 0
  fi
fi

# Session has no content - block and prompt for save
cat << 'PROMPT_EOF'
{
  "decision": "block",
  "reason": "Before ending this session, please write a session summary to preserve context for future resumption.\n\nWrite to: $SESSION_DIR/session.md\n\nInclude:\n- Goal: What you were trying to accomplish\n- Outcome: What was achieved or why blocked\n- Key Decisions: Important choices made\n- Files Changed: What was modified\n- Next Steps: What should happen next\n\nAfter writing the summary, you can conclude the session."
}
PROMPT_EOF
