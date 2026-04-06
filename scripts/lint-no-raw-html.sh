#!/usr/bin/env bash
# Enforce @ui primitives — block raw HTML elements in production .tsx files.
# Runs as a lint-staged hook. Receives file paths as arguments.
#
# Allowed exceptions (grep -v):
#   - primitives/ — the wrapper components themselves
#   - buttons/base/Button.tsx — the Button wrapper
#   - inputs/input/, inputs/textarea/, inputs/select/ — input wrappers
#   - editors/ — rich text editors wrapping contenteditable
#   - forms/inputs/, forms/selectors/, forms/upload/, forms/pickers/ — form field wrappers
#   - .test., .spec., .stories. — test and story files

set -euo pipefail

violations=0
violated_files=()

for file in "$@"; do
  # Skip non-tsx files
  [[ "$file" != *.tsx ]] && continue

  # Skip test, spec, story files
  [[ "$file" == *.test.* ]] && continue
  [[ "$file" == *.spec.* ]] && continue
  [[ "$file" == *.stories.* ]] && continue

  # Skip legitimate primitive wrappers
  [[ "$file" == */primitives/* ]] && continue
  [[ "$file" == */buttons/base/Button.tsx ]] && continue
  [[ "$file" == */inputs/input/* ]] && continue
  [[ "$file" == */inputs/textarea/* ]] && continue
  [[ "$file" == */inputs/select/* ]] && continue
  [[ "$file" == */editors/* ]] && continue
  [[ "$file" == */forms/inputs/* ]] && continue
  [[ "$file" == */forms/selectors/* ]] && continue
  [[ "$file" == */forms/upload/* ]] && continue
  [[ "$file" == */forms/pickers/* ]] && continue

  # Check for raw HTML elements (excluding legitimate uses)
  # Match <button, <textarea, <select but NOT <input (too many legitimate uses like type="file")
  if grep -qnE '<button\b|<textarea\b|<select\b' "$file" 2>/dev/null; then
    matches=$(grep -nE '<button\b|<textarea\b|<select\b' "$file" 2>/dev/null || true)
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
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ✘ Found raw HTML elements in $violations file(s)."
  echo ""
  echo "  Use centralized @ui components instead:"
  echo "    <button>   → Button from @ui/buttons/base/Button"
  echo "    <textarea> → Textarea from @ui/primitives/textarea"
  echo "    <select>   → Select from @ui/primitives/select"
  echo ""
  echo "  If this is a legitimate wrapper, add the path to the"
  echo "  exclusion list in scripts/lint-no-raw-html.sh"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
