#!/usr/bin/env sh
set -eu

# Runs the Biome version pinned in package.json (node_modules/.bin/biome).
# Without `bun install` there is no local Biome, and `bunx biome` falls back to
# an unrelated npm package named "biome" that prints nothing and exits 0, so a
# format error only shows up in CI. Fail loudly instead (exit 127).
root="$(cd "$(dirname "$0")/../.." && pwd)"
bin="$root/node_modules/.bin/biome"

if [ ! -x "$bin" ]; then
  echo "biome: $bin not found. Run 'bun install' in $root first." >&2
  exit 127
fi

exec "$bin" "$@"
