#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# Historical logs are immutable and allowed to contain legacy references.
EXCLUDE_GLOBS=(
  "!.git/**"
  "!.agents/**"
  "!.agents/SESSIONS/**"
  "!**/node_modules/**"
  "!**/.next/**"
  "!**/dist/**"
  "!**/*.md"
  "!.gitignore"
  "!scripts/sh/enforce-github-issues-only.sh"
)

PATTERN='(\.agents/TASKS/|\.agents/PRDS/|INBOX\.md|issues-all\.json|AUDIT-SYNC-REPORT|sync_tasks_issues\.py|sync-tasks-issues\.sh|task-sync/)'

set +e
MATCHES=$(rg -n "$PATTERN" . --hidden --glob "${EXCLUDE_GLOBS[0]}" --glob "${EXCLUDE_GLOBS[1]}" --glob "${EXCLUDE_GLOBS[2]}" --glob "${EXCLUDE_GLOBS[3]}" --glob "${EXCLUDE_GLOBS[4]}" --glob "${EXCLUDE_GLOBS[5]}" --glob "${EXCLUDE_GLOBS[6]}" --glob "${EXCLUDE_GLOBS[7]}" --glob "${EXCLUDE_GLOBS[8]}")
RG_EXIT=$?
set -e

if [[ $RG_EXIT -eq 0 ]]; then
  echo "ERROR: Found forbidden local-tracking references. Use GitHub Issues only."
  echo
  echo "$MATCHES"
  exit 1
fi

if [[ $RG_EXIT -ne 1 ]]; then
  echo "ERROR: rg command failed"
  exit "$RG_EXIT"
fi

echo "OK: GitHub-only tracking policy check passed."
