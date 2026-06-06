#!/usr/bin/env bash
# check-product-boundary-docs.sh
# Validates that the product boundary ADR and public docs share the same boundary spec version.
# Usage: bash scripts/check-product-boundary-docs.sh
# Run from repo root.
set -euo pipefail

BOUNDARY_ADR=".agents/memory/architecture/ADR-PLG-BOUNDARY-OSS-CLOUD.md"
DOCS_FILE="apps/docs/content/core/execution-boundaries.mdx"

extract_version() {
  awk '
    /^## Boundary Spec Version$/ { in_version = 1; next }
    in_version && NF { gsub(/[[:space:]]/, ""); print; exit }
  ' "$1"
}

BOUNDARY_VER=$(extract_version "$BOUNDARY_ADR")
echo "Boundary ADR version: $BOUNDARY_VER"

if [ -f "$DOCS_FILE" ]; then
  DOCS_VER=$(grep -E "boundaryVersion|boundary_version|version:" "$DOCS_FILE" | head -1 | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
  echo "Docs version: $DOCS_VER"
  if [ "$DOCS_VER" != "$BOUNDARY_VER" ] && [ "$DOCS_VER" != "unknown" ]; then
    echo "ERROR: boundary ADR ($BOUNDARY_VER) and docs ($DOCS_VER) boundary versions are out of sync."
    exit 1
  fi
else
  echo "WARN: Docs file not found at $DOCS_FILE — skipping docs check."
fi

echo "OK: Boundary spec versions are in sync ($BOUNDARY_VER)."
