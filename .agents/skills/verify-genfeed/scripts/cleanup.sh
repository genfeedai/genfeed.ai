#!/usr/bin/env bash
# Stop this checkout's dev processes and scratch output. Keeps evidence, other
# worktrees and the shared Portless proxy untouched.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PATTERN="$ROOT/(scripts/dev|apps/|packages/|node_modules)"
SELF="$$"

dev_pids() {
  pgrep -f "$PATTERN" | grep -vx "$SELF" || true
}

PIDS="$(dev_pids)"
if [ -n "$PIDS" ]; then
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null || true
  sleep 3
  LEFT="$(dev_pids)"
  # shellcheck disable=SC2086
  [ -z "$LEFT" ] || kill -9 $LEFT 2>/dev/null || true
fi

rm -rf "$ROOT/playwright/artifacts/results" "$ROOT/apps/app/.next/dev/cache"

bun run dev:status
