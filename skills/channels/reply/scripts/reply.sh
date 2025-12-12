#!/bin/bash
# Reply to a message thread
# Usage: reply.sh <channel> <messageId> <message> [--from <from>]

set -e

if [[ $# -lt 3 ]]; then
  echo "Usage: reply.sh <channel> <messageId> <message> [--from <from>]"
  echo ""
  echo "Examples:"
  echo "  reply.sh '#status' '2025-12-12T14:30:22.123Z' 'Task completed'"
  echo "  reply.sh '#issues' '2025-12-12T10:00:00.000Z' 'Fixed' --from 'workflow/fix'"
  exit 1
fi

CHANNEL="$1"
MESSAGE_ID="$2"
MESSAGE="$3"
shift 3

# Pass remaining args to dot-agents
dot-agents channels reply "$CHANNEL" "$MESSAGE_ID" "$MESSAGE" "$@"
