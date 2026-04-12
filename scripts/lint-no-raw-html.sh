#!/usr/bin/env bash
# Enforce @ui primitives — block raw HTML elements in production .tsx files.
# Runs as a lint-staged hook. Receives file paths as arguments.
#
# Excluded paths (legitimate wrappers):
#   - primitives/          — the Radix primitive wrappers themselves
#   - buttons/base/        — the Button wrapper component
#   - inputs/input/        — the Input wrapper
#   - inputs/textarea/     — the Textarea wrapper
#   - editors/             — rich text editors (contenteditable)
#   - forms/inputs/        — form field input wrappers
#   - forms/selectors/     — form field selector wrappers
#   - forms/upload/        — dropzone/file upload wrappers
#   - forms/pickers/       — date/color picker wrappers
#   - display/table/       — the Table wrapper
#   - navigation/          — pagination and nav wrappers
#   - feedback/            — alert, spinner wrappers
#   - .test. .spec. .stories. — test and story files

set -euo pipefail

# ─── Raw HTML → @ui primitive mapping ──────────────────────────────────
# Each entry: "pattern|replacement"
RULES=(
  '<input\b|Input from @ui/primitives/input'
  '<button\b|Button from @ui/primitives/button'
  '<textarea\b|Textarea from @ui/primitives/textarea'
  '<select\b|Select from @ui/primitives/select'
  '<dialog\b|Dialog from @ui/primitives/dialog'
  '<table\b|Table from @ui/primitives/table'
  '<details\b|Collapsible from @ui/primitives/collapsible'
  '<summary\b|CollapsibleTrigger from @ui/primitives/collapsible'
  '<progress\b|Progress from @ui/primitives/progress'
  '<hr\b|Separator from @ui/primitives/separator'
)

# Build combined grep pattern from all rules
PATTERN=""
for rule in "${RULES[@]}"; do
  element_pattern="${rule%%|*}"
  if [ -z "$PATTERN" ]; then
    PATTERN="$element_pattern"
  else
    PATTERN="$PATTERN|$element_pattern"
  fi
done

# ─── Dead wrapper import bans ───────────────────────────────────────────
# Each entry: "pattern|replacement"
IMPORT_RULES=(
  "@/components/ui/input|@ui/primitives/input"
  "@/components/ui/textarea|@ui/primitives/textarea"
  "@/components/ui/select|@ui/primitives/select"
  "@/features/workflows/components/ui/inputs/input/Input|@ui/primitives/input"
  "@/features/workflows/components/ui/inputs/textarea/Textarea|@ui/primitives/textarea"
  "@/features/workflows/components/ui/inputs/select/Select|@ui/primitives/select"
)

IMPORT_PATTERN=""
for rule in "${IMPORT_RULES[@]}"; do
  import_pattern="${rule%%|*}"
  if [ -z "$IMPORT_PATTERN" ]; then
    IMPORT_PATTERN="$import_pattern"
  else
    IMPORT_PATTERN="$IMPORT_PATTERN|$import_pattern"
  fi
done

violations=0
violated_files=()

for file in "$@"; do
  # Skip unsupported files
  [[ "$file" != *.tsx && "$file" != *.ts ]] && continue

  # Skip test, spec, story, and mock files
  [[ "$file" == *.test.* ]] && continue
  [[ "$file" == *.spec.* ]] && continue
  [[ "$file" == *.stories.* ]] && continue
  [[ "$file" == */__mocks__/* ]] && continue

  # Skip local UI wrappers (e.g. src/components/ui/textarea.tsx)
  [[ "$file" == */src/components/ui/* ]] && continue

  # Skip legitimate primitive/wrapper paths
  [[ "$file" == */primitives/* ]] && continue
  [[ "$file" == */buttons/base/* ]] && continue
  [[ "$file" == */inputs/input/* ]] && continue
  [[ "$file" == */inputs/textarea/* ]] && continue
  [[ "$file" == */editors/* ]] && continue
  [[ "$file" == */forms/inputs/* ]] && continue
  [[ "$file" == */forms/selectors/* ]] && continue
  [[ "$file" == */forms/upload/* ]] && continue
  [[ "$file" == */forms/pickers/* ]] && continue
  [[ "$file" == */display/table/* ]] && continue
  [[ "$file" == */navigation/* ]] && continue
  [[ "$file" == */feedback/* ]] && continue
  # Skip workflow-ui package (internal UI components with own modal/dialog patterns)
  [[ "$file" == *packages/workflow-ui/* ]] && continue

  # Check for raw HTML elements in TSX only
  if [[ "$file" == *.tsx ]] && grep -qnE "$PATTERN" "$file" 2>/dev/null; then
    matches=$(grep -nE "$PATTERN" "$file" 2>/dev/null || true)
    # Filter out JSX comments {/* ... */} — crude but effective
    matches=$(echo "$matches" | grep -v '{/\*' | grep -v '\*/' || true)
    if [ -n "$matches" ]; then
      violated_files+=("$file")
      violations=$((violations + 1))
      echo ""
      echo "  ✘ $file"
      echo "$matches" | while IFS= read -r line; do
        echo "    $line"
      done
    fi
  fi

  # Check for banned wrapper imports in TS/TSX
  if grep -qnE "$IMPORT_PATTERN" "$file" 2>/dev/null; then
    matches=$(grep -nE "$IMPORT_PATTERN" "$file" 2>/dev/null || true)
    if [ -n "$matches" ]; then
      violated_files+=("$file")
      violations=$((violations + 1))
      echo ""
      echo "  ✘ $file"
      echo "$matches" | while IFS= read -r line; do
        echo "    $line"
      done
    fi
  fi
done

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ✘ Found raw HTML elements in $violations file(s)."
  echo ""
  echo "  Use centralized @ui components instead:"
  echo ""
  for rule in "${RULES[@]}"; do
    element_pattern="${rule%%|*}"
    replacement="${rule#*|}"
    # Clean up the pattern for display
    display_tag=$(echo "$element_pattern" | sed 's/\\b/>/g' | sed 's/</</g')
    printf "    %-14s → %s\n" "$display_tag" "$replacement"
  done
  echo ""
  echo "  Dead wrapper imports are also blocked:"
  echo ""
  for rule in "${IMPORT_RULES[@]}"; do
    import_pattern="${rule%%|*}"
    replacement="${rule#*|}"
    printf "    %-64s → %s\n" "$import_pattern" "$replacement"
  done
  echo ""
  echo "  If this is a legitimate wrapper, add the path to the"
  echo "  exclusion list in scripts/lint-no-raw-html.sh"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
