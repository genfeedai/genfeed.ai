#!/usr/bin/env bash
#
# Copy the gitignored files listed in `.worktreeinclude` from the primary git
# worktree into the current worktree.
#
# Git worktrees only share tracked history — gitignored files like `.env` /
# `.env.local` do NOT come along, so a fresh worktree can't run anything until
# they're copied. `.worktreeinclude` declares which files to carry over (env
# files, local Prisma env, etc.); this script is what actually acts on it, for
# ANY worktree regardless of how it was created (`git worktree add`, Codex,
# Claude Code, etc.).
#
# Usage:
#   bun run wt:sync                       # from inside a freshly-created worktree
#   scripts/sync-worktree-includes.sh              # ditto
#   scripts/sync-worktree-includes.sh <worktree>   # target an explicit worktree
#                                                   # (used by the `git wt` alias,
#                                                   # since `git worktree add`
#                                                   # leaves you in the primary)
#
# Safe + idempotent: never clobbers an existing file, no-ops in the primary
# worktree, and skips patterns that match nothing.

set -uo pipefail

if [ "$#" -ge 1 ] && [ -n "${1:-}" ]; then
  current="$(cd "$1" 2>/dev/null && pwd)" || {
    echo "wt:sync — target worktree '$1' not found" >&2
    exit 0
  }
else
  current="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "wt:sync — not inside a git worktree, nothing to do" >&2
    exit 0
  }
fi
common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0
primary="$(dirname "$common_dir")"

if [ "$current" = "$primary" ]; then
  echo "wt:sync — this IS the primary worktree; nothing to copy"
  exit 0
fi

include_file="$primary/.worktreeinclude"
if [ ! -f "$include_file" ]; then
  echo "wt:sync — no .worktreeinclude in $primary, nothing to do"
  exit 0
fi

echo "wt:sync — copying .worktreeinclude files from primary worktree"
echo "  primary: $primary"
echo "  current: $current"

copied=0
skipped=0

# Expand each glob relative to the primary worktree.
cd "$primary" || exit 1
shopt -s nullglob

while IFS= read -r pattern || [ -n "$pattern" ]; do
  # Ignore blank lines and comments.
  case "$pattern" in
    '' | '#'*) continue ;;
  esac

  # shellcheck disable=SC2086 # intentional glob expansion of the pattern
  for rel in $pattern; do
    [ -f "$primary/$rel" ] || continue
    dest="$current/$rel"
    if [ -e "$dest" ]; then
      skipped=$((skipped + 1))
      continue
    fi
    mkdir -p "$(dirname "$dest")"
    if cp "$primary/$rel" "$dest"; then
      echo "  + $rel"
      copied=$((copied + 1))
    fi
  done
done < "$include_file"

echo "wt:sync — done ($copied copied, $skipped already present)"
