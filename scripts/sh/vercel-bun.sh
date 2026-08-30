#!/usr/bin/env sh

set -eu

# Hosted SaaS runs `setup-bun-env` (bun install) and then `vercel build`,
# which invokes this script again as the Vercel installCommand. Skip the
# second install when the workspace is already populated.
if [ "${1:-}" = "install" ] && [ -d node_modules ] && [ -f bun.lock ]; then
  echo "vercel-bun: node_modules present, skipping bun install"
  exit 0
fi

# Use the same rolling-stable policy as local setup and CI.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BUN_VERSION=$(xargs < "$SCRIPT_DIR/../../.bun-version")
exec bunx "bun@$BUN_VERSION" "$@"
