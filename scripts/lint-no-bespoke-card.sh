#!/usr/bin/env bash
# Enforce the shared Card — block hand-rolled "cards" in production .tsx files.
#
# The signature this catches is "someone rebuilt Card by hand": a raw block
# element whose className combines a card surface token, a rounded corner, an
# all-side border, and padding. That combination is the visual fingerprint of a
# content card and should use the shared component instead:
#
#     import Card from '@ui/card/Card';
#     import { CardVariant } from '@genfeedai/enums';
#     <Card variant={CardVariant.DEFAULT} bodyClassName="...">…</Card>
#
# Canonical component: packages/ui/src/components/card/Card.tsx
#
# Modeled on scripts/lint-no-raw-html.sh. Two run modes:
#   • lint-staged (pre-commit): file paths are passed as arguments; only those
#     files are checked.
#   • CI (no arguments): the whole in-scope tree is scanned.
#
# Baseline: scripts/lint-no-bespoke-card.allowlist freezes the surfaces that
# legitimately (or, for now, historically) carry the signature so the gate is
# green on master. New violations anywhere else fail. See that file's header for
# the permanent-vs-migrate split and the tracking issue.
#
# Portability: pure POSIX ERE (grep -E). No `grep -P`, `\b`, or lookaheads — the
# pre-commit hook runs on macOS (BSD grep) and CI runs on Linux (GNU grep).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ALLOWLIST_FILE="$SCRIPT_DIR/lint-no-bespoke-card.allowlist"

# Scope: the two trees where product cards live and where the signature was
# validated. Kept narrow on purpose — mirrors the detector that produced the
# baseline. Extend deliberately, re-baselining as you go.
SCAN_DIRS=(apps/app packages/pages)

# ─── Detector token classes (all must co-occur on one className line) ──────────
#   surface  : bg-card (incl. bg-card/NN), bg-background-secondary|tertiary
#   rounded  : rounded-card|md|lg|xl|2xl
#   border   : `border` as a standalone utility (NOT border-r/l/t/b/x/y/-color)
#   padding  : p-N / px-N / py-N
# The element must be a raw block (div/section/article/aside), so lines opening
# an <input|textarea|button|Button|Card|Input|Textarea> are excluded.
SURFACE_RE='className="[^"]*(bg-card|bg-background-secondary|bg-background-tertiary)[^"]*"'
ROUNDED_RE='rounded-(card|md|lg|xl|2xl)'
# Standalone `border` = word-boundary emulation via non-[word/dash] neighbours.
BORDER_RE='(^|[^-A-Za-z0-9_])border([^-A-Za-z0-9_]|$)'
PADDING_RE='(^|[^-A-Za-z0-9_])p[xy]?-[0-9]'
EXCLUDE_ELEMENT_RE='<(input|textarea|button|Button|Card|Input|Textarea)([^A-Za-z0-9_]|$)'

# ─── Load allowlist (repo-relative paths, one per line; `#` comments ignored) ──
declare -a ALLOWLIST=()
if [[ -f "$ALLOWLIST_FILE" ]]; then
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    line="${raw%%#*}"                       # strip trailing comment
    line="${line#"${line%%[![:space:]]*}"}" # ltrim
    line="${line%"${line##*[![:space:]]}"}" # rtrim
    [[ -z "$line" ]] && continue
    ALLOWLIST+=("$line")
  done < "$ALLOWLIST_FILE"
fi

is_allowlisted() {
  local file="$1"
  local entry
  for entry in "${ALLOWLIST[@]}"; do
    [[ "$file" == "$entry" ]] && return 0
  done
  return 1
}

# Normalize an incoming path to repo-relative (handles absolute paths and ./).
to_repo_relative() {
  local file="$1"
  file="${file#"$REPO_ROOT"/}"
  file="${file#./}"
  printf '%s' "$file"
}

detect_in_file() {
  # Prints "LINE:content" for each offending line; empty if none.
  grep -nE "$SURFACE_RE" -- "$1" 2>/dev/null \
    | grep -E "$ROUNDED_RE" \
    | grep -E "$BORDER_RE" \
    | grep -E "$PADDING_RE" \
    | grep -Ev "$EXCLUDE_ELEMENT_RE" || true
}

in_scope() {
  local file="$1" dir
  for dir in "${SCAN_DIRS[@]}"; do
    [[ "$file" == "$dir"/* ]] && return 0
  done
  return 1
}

# ─── Collect candidate files ──────────────────────────────────────────────────
declare -a FILES=()
if [[ "$#" -gt 0 ]]; then
  # lint-staged mode: check the passed files.
  for arg in "$@"; do
    rel="$(to_repo_relative "$arg")"
    [[ "$rel" == *.tsx ]] || continue
    FILES+=("$rel")
  done
else
  # CI mode: scan the whole in-scope tree.
  while IFS= read -r rel; do
    FILES+=("$rel")
  done < <(cd "$REPO_ROOT" && find "${SCAN_DIRS[@]}" -name '*.tsx' -type f 2>/dev/null | sort)
fi

violations=0
declare -a offending_lines=()

for rel in "${FILES[@]}"; do
  # Skip test/spec/story files.
  [[ "$rel" == *.test.* ]] && continue
  [[ "$rel" == *.spec.* ]] && continue
  [[ "$rel" == *.stories.* ]] && continue
  in_scope "$rel" || continue
  is_allowlisted "$rel" && continue

  abs="$REPO_ROOT/$rel"
  [[ -f "$abs" ]] || continue

  matches="$(detect_in_file "$abs")"
  [[ -z "$matches" ]] && continue

  violations=$((violations + 1))
  echo ""
  echo "  ✘ $rel"
  while IFS= read -r m; do
    lineno="${m%%:*}"
    offending_lines+=("$rel:$lineno")
    echo "    $rel:$lineno"
  done <<< "$matches"
done

if [[ "$violations" -gt 0 ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ✘ Found $violations file(s) with a hand-rolled card surface."
  echo ""
  echo "  A raw <div>/<section>/<article>/<aside> that combines a card"
  echo "  surface + rounded corner + all-side border + padding is a Card"
  echo "  rebuilt by hand. Use the shared component instead:"
  echo ""
  echo "    packages/ui/src/components/card/Card.tsx"
  echo "    import Card from '@ui/card/Card';"
  echo "    import { CardVariant } from '@genfeedai/enums';"
  echo "    <Card variant={CardVariant.DEFAULT} bodyClassName=\"…\">…</Card>"
  echo ""
  echo "  If this surface is a legitimate non-card (editor chrome, a"
  echo "  full-screen overlay, a graph-node primitive), add its path to"
  echo "  scripts/lint-no-bespoke-card.allowlist with a reason."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
