#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NGROK_SCRIPT="$ROOT_DIR/scripts/dev/start-backend-ngrok.sh"

kill_backend_watchers() {
  local patterns=(
    "turbo dev --filter=@genfeedai/api --filter=@genfeedai/files --filter=@genfeedai/mcp --filter=@genfeedai/notifications --filter=@genfeedai/workers"
    "bun --watch mcp/src/main.ts"
    "bun --watch files/src/main.ts"
    "bun --watch workers/src/main.ts"
    "nest start notifications --watch"
    "bun --watch api/src/main.ts"
  )

  local pattern
  for pattern in "${patterns[@]}"; do
    pkill -f "$pattern" >/dev/null 2>&1 || true
  done

  sleep 2
}

bash "$NGROK_SCRIPT"
kill_backend_watchers

cd "$ROOT_DIR"
exec bun run dev:backend
