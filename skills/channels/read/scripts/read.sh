#!/bin/bash
# Read messages from a channel
# Usage: read.sh <channel> [--limit <n>] [--since <duration>]

set -e

if [[ $# -lt 1 ]]; then
  echo "Usage: read.sh <channel> [--limit <n>] [--since <duration>]"
  echo ""
  echo "Examples:"
  echo "  read.sh '#status'"
  echo "  read.sh '#status' --limit 5"
  echo "  read.sh '#issues' --since 24h"
  exit 1
fi

CHANNEL="$1"
shift

# Pass remaining args to dot-agents
dot-agents channels read "$CHANNEL" "$@"
