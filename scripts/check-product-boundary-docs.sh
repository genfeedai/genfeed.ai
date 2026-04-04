#!/usr/bin/env bash
# check-product-boundary-docs.sh
# Validates that Cloud ADR, Core mirror, and docs all share the same boundary spec version.
# Usage: bash scripts/check-product-boundary-docs.sh
# Run from repo root.
set -euo pipefail

CLOUD_ADR=".agents/SYSTEM/architecture/ADR-PLG-BOUNDARY-OSS-CLOUD.md"
CORE_ADR="../core/.agents/SYSTEM/architecture/ADR-PLG-BOUNDARY-OSS-CLOUD.md"
DOCS_FILE="../docs/content/product/core-cloud-boundary.mdx"

extract_version() {
  grep -E "^## Boundary Spec Version" "$1" -A1 | tail -1 | tr -d ' '
}

CLOUD_VER=$(extract_version "$CLOUD_ADR")
echo "Cloud ADR version: $CLOUD_VER"

if [ -f "$CORE_ADR" ]; then
  CORE_VER=$(extract_version "$CORE_ADR")
  echo "Core mirror version: $CORE_VER"
  if [ "$CLOUD_VER" != "$CORE_VER" ]; then
    echo "ERROR: Cloud ($CLOUD_VER) and Core ($CORE_VER) boundary versions are out of sync."
    exit 1
  fi
else
  echo "WARN: Core mirror ADR not found at $CORE_ADR — skipping cross-repo check."
fi

if [ -f "$DOCS_FILE" ]; then
  DOCS_VER=$(grep -E "boundaryVersion|boundary_version|version:" "$DOCS_FILE" | head -1 | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
  echo "Docs version: $DOCS_VER"
  if [ "$DOCS_VER" != "$CLOUD_VER" ] && [ "$DOCS_VER" != "unknown" ]; then
    echo "ERROR: Cloud ($CLOUD_VER) and docs ($DOCS_VER) boundary versions are out of sync."
    exit 1
  fi
else
  echo "WARN: Docs file not found at $DOCS_FILE — skipping docs check."
fi

echo "OK: Boundary spec versions are in sync ($CLOUD_VER)."
