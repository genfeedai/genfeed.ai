#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): format + lint the just-edited file with Biome.
# Auto-fixes what it can in place; exit 2 surfaces remaining issues to the agent
# immediately instead of at the pre-push checklist. Fail-open on infra errors.
set -u

export PATH="$HOME/.bun/bin:$PATH"
command -v bunx >/dev/null 2>&1 || exit 0

input=$(cat)
file=$(printf '%s' "$input" | python3 -c 'import json,sys; print((json.load(sys.stdin).get("tool_input") or {}).get("file_path",""))' 2>/dev/null) || exit 0

case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.json | *.jsonc) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

# Resolve the checkout that actually contains the file. Git worktrees live
# outside CLAUDE_PROJECT_DIR, so running from the project dir against an
# absolute worktree path silently loses every `overrides` entry in biome.json —
# those globs (`apps/server/**`, ...) are matched relative to the config root.
# Losing them turns `useImportType` back on and rewrites NestJS constructor-DI
# and @Body/@Query DTO imports to `import type`, which erases design:paramtypes
# under emitDecoratorMetadata: DI injects undefined and ValidationPipe silently
# skips validation, while type-check and lint stay green.
root=$(cd "$(dirname "$file")" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)
[ -n "$root" ] || root="${CLAUDE_PROJECT_DIR:-.}"
cd "$root" || exit 0

# Pass the path relative to that root so the overrides match.
rel="${file#"$root"/}"

if ! output=$(bunx biome check --write --no-errors-on-unmatched "$rel" 2>&1); then
  {
    echo "Biome found unfixable issues in $rel — fix them now:"
    printf '%s\n' "$output" | tail -40
  } >&2
  exit 2
fi

exit 0
