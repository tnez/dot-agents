#!/bin/bash
# Session end logger hook for dot-agents
# Runs when Claude Code session ends (SessionEnd hook)
#
# Purpose: Log session end events and cleanup
#
# Environment:
#   DOT_AGENTS_SESSION_DIR - Path to session directory
#   DOT_AGENTS_SESSION_ID - Session identifier
#
# Input (stdin JSON):
#   session_id, transcript_path, reason, etc.
#
# This hook cannot block session termination - it's for cleanup/logging only

set -e

# Read hook input from stdin
INPUT=$(cat)

# Parse input
REASON=$(echo "$INPUT" | jq -r '.reason // "unknown"')
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""')
CC_SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')

# Get session info from environment (set by dot-agents)
SESSION_DIR="${DOT_AGENTS_SESSION_DIR:-}"
SESSION_ID="${DOT_AGENTS_SESSION_ID:-}"

# If no session directory, nothing to do
if [ -z "$SESSION_DIR" ]; then
  exit 0
fi

# Append session end metadata to session.md
SESSION_MD="$SESSION_DIR/session.md"

if [ -f "$SESSION_MD" ]; then
  # Add session end metadata
  cat >> "$SESSION_MD" << EOF

---
_session_end:
  reason: $REASON
  ended_at: $(date -Iseconds)
  claude_session_id: $CC_SESSION_ID
EOF
fi

# Optionally copy transcript to session directory
if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  cp "$TRANSCRIPT" "$SESSION_DIR/transcript.jsonl" 2>/dev/null || true
fi

exit 0
