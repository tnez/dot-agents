#!/bin/bash
# Publish a message to a channel
# Usage: publish.sh <channel> <message> [--from <from>] [--tags <tags>] [--run-id <runId>]

set -e

if [[ $# -lt 2 ]]; then
  echo "Usage: publish.sh <channel> <message> [--from <from>] [--tags <tags>] [--run-id <runId>]"
  echo ""
  echo "Examples:"
  echo "  publish.sh '#status' 'Starting task...'"
  echo "  publish.sh '#issues' 'API failed' --from 'workflow/inbox' --tags 'error,api'"
  exit 1
fi

CHANNEL="$1"
MESSAGE="$2"
shift 2

# Pass remaining args to dot-agents
dot-agents channels publish "$CHANNEL" "$MESSAGE" "$@"
