#!/usr/bin/env bash
#
# Add a worktree and sync the gitignored files declared in `.worktreeinclude`.
#
# Usage:
#   scripts/git-wt.sh [git-worktree-add-options] <path> [commit-ish]

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 [git-worktree-add-options] <path> [commit-ish]" >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
before_worktrees=()
while IFS= read -r worktree_path; do
  before_worktrees+=("$worktree_path")
done < <(
  git worktree list --porcelain |
    awk '/^worktree /{print substr($0, 10)}'
)

git worktree add "$@"

new_worktree=""
new_worktree_count=0
while IFS= read -r worktree_path; do
  is_existing=0
  for existing_worktree in "${before_worktrees[@]}"; do
    if [ "$worktree_path" = "$existing_worktree" ]; then
      is_existing=1
      break
    fi
  done

  if [ "$is_existing" -eq 0 ]; then
    new_worktree="$worktree_path"
    new_worktree_count=$((new_worktree_count + 1))
  fi
done < <(
  git worktree list --porcelain |
    awk '/^worktree /{print substr($0, 10)}'
)

if [ "$new_worktree_count" -ne 1 ]; then
  echo "git wt — expected one new worktree, found $new_worktree_count" >&2
  exit 1
fi

"$repo_root/scripts/sync-worktree-includes.sh" "$new_worktree"
