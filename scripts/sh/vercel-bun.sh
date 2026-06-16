#!/usr/bin/env sh

set -eu

# Pin to 1.3.14 to match CI (.github/actions/setup-bun-env) and local dev.
# 1.3.10 did not resolve tsconfig `paths` aliases in `bun run <script>.ts`, so
# the website prebuild (generate-llms-txt.ts → `@data/*`) failed only on Vercel.
exec bunx bun@1.3.14 "$@"
