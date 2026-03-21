#!/usr/bin/env bash
# Creates GitHub issue #XX from docs/planning/CROSS_PLATFORM_CLI_COMPATIBILITY.md
# Run: ./scripts/create-cli-compat-issue.sh
# Requires: gh CLI authenticated (gh auth login)

set -euo pipefail

REPO="KHAEntertainment/clawvault"
TITLE="Enhancement: Cross-platform CLI tool compatibility (Claude Code, Aider, etc.)"
LABEL="enhancement"

# Strip the "GitHub Issue Draft" header line from the doc
BODY=$(sed '1,3d' docs/planning/CROSS_PLATFORM_CLI_COMPATIBILITY.md)

gh issue create \
  --repo "$REPO" \
  --title "$TITLE" \
  --label "$LABEL" \
  --body "$BODY"
