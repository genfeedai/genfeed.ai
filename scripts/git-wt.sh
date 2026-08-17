#!/usr/bin/env bash
#
# Add a worktree and sync the gitignored files declared in `.worktreeinclude`.
#
# Usage:
#   scripts/git-wt.sh [git-worktree-add-options] <name-or-path> [commit-ish]
#
# Worktrees live inside the repo, under `<repo>/.worktrees/` (gitignored). A bare
# name resolves to `<repo>/.worktrees/<name>`; any explicit path outside
# `.worktrees/` is refused, so agent
# lanes stop scattering multi-GB checkouts across `/tmp`, sibling dirs, and $HOME.

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 [git-worktree-add-options] <name-or-path> [commit-ish]" >&2
  exit 1
fi

# Anchor on the primary checkout, not the current worktree — running `git wt`
# from inside a worktree must never nest a worktree inside a worktree.
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
primary_root="$(dirname "$common_dir")"
worktrees_root="$primary_root/.worktrees"

# Locate the <path> positional: the first argument that is not an option and not
# the value of an option that takes one (-b/-B/--reason/--orphan-less forms).
path_index=-1
i=1
skip_next=0
for arg in "$@"; do
  if [ "$skip_next" -eq 1 ]; then
    skip_next=0
  elif [ "$arg" = "-b" ] || [ "$arg" = "-B" ] || [ "$arg" = "--reason" ]; then
    skip_next=1
  elif [ "${arg#-}" = "$arg" ]; then
    path_index="$i"
    break
  fi
  i=$((i + 1))
done

if [ "$path_index" -eq -1 ]; then
  echo "git wt — no worktree path given" >&2
  exit 1
fi

args=("$@")
requested="${args[$((path_index - 1))]}"
case "$requested" in
  */*|.|..) resolved="$requested" ;;
  *) resolved="$worktrees_root/$requested" ;;
esac

mkdir -p "$worktrees_root"

# Normalise to an absolute path. The leaf need not exist yet; the parent must.
case "$resolved" in
  /*) abs="$resolved" ;;
  *) abs="$PWD/$resolved" ;;
esac
parent="$(dirname "$abs")"
if [ -d "$parent" ]; then
  abs="$(cd "$parent" && pwd -P)/$(basename "$abs")"
fi

# Direct child only — `.worktrees/<name>` — never a worktree inside a worktree.
case "$(dirname "$abs")" in
  "$worktrees_root") ;;
  *)
    echo "git wt — worktrees must be direct children of $worktrees_root/ (got: $abs)" >&2
    echo "         pass a bare name, e.g. \`git wt feat-123-short-title\`" >&2
    exit 1
    ;;
esac

args[path_index - 1]="$abs"
set -- "${args[@]}"
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

"$primary_root/scripts/sync-worktree-includes.sh" "$new_worktree"
