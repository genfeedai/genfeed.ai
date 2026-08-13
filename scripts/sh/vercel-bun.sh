#!/usr/bin/env sh

set -eu

# Hosted SaaS runs `setup-bun-env` (bun install) and then `vercel build`,
# which invokes this script again as the Vercel installCommand. Skip the
# second install when the workspace is already populated.
if [ "${1:-}" = "install" ] && [ -d node_modules ] && [ -f bun.lock ]; then
  echo "vercel-bun: node_modules present, skipping bun install"
  exit 0
fi

# Pin to 1.3.14 to match CI (.github/actions/setup-bun-env) and local dev.
# 1.3.10 did not resolve tsconfig `paths` aliases in `bun run <script>.ts`, so
# the website prebuild (generate-llms-txt.ts → `@data/*`) failed only on Vercel.
exec bunx bun@1.3.14 "$@"
