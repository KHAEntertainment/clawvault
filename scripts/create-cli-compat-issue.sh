#!/usr/bin/env bash
# Creates GitHub issue #XX from docs/planning/CROSS_PLATFORM_CLI_COMPATIBILITY.md
# Run: ./scripts/create-cli-compat-issue.sh
# Requires: gh CLI authenticated (gh auth login)

set -euo pipefail

DEFAULT_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo 'KHAEntertainment/clawvault')"
REPO="${REPO:-$DEFAULT_REPO}"
TITLE="Enhancement: Cross-platform CLI tool compatibility (Claude Code, Aider, etc.)"
LABEL="enhancement"

# Strip the "GitHub Issue Draft" header lines (first 3 lines) from the doc and write to a temp file
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT
sed '1,3d' docs/planning/CROSS_PLATFORM_CLI_COMPATIBILITY.md > "$BODY_FILE"

gh issue create \
  --repo "$REPO" \
  --title "$TITLE" \
  --label "$LABEL" \
  --body-file "$BODY_FILE"
