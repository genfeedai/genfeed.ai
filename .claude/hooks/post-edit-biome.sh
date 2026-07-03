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

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if ! output=$(bunx biome check --write --no-errors-on-unmatched "$file" 2>&1); then
  {
    echo "Biome found unfixable issues in $file — fix them now:"
    printf '%s\n' "$output" | tail -40
  } >&2
  exit 2
fi

exit 0
