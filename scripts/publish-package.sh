#!/usr/bin/env bash
#
# Publish a @genfeedai/* package to npm.
#
# Uses `bun publish` which automatically resolves workspace:* protocols
# to real versions. Never use `npm publish` — it publishes workspace:*
# literally, breaking external consumers.
#
# Usage:
#   ./scripts/publish-package.sh packages/enums              # patch bump + publish
#   ./scripts/publish-package.sh packages/interfaces minor    # minor bump + publish
#   ./scripts/publish-package.sh packages/cli major           # major bump + publish
#   ./scripts/publish-package.sh packages/enums --no-bump     # publish current version
#
# Requirements:
#   - bun >= 1.2 (for workspace:* resolution)
#   - NPM_TOKEN env var or ~/.npmrc with auth
#   - Clean git working tree

set -euo pipefail

PKG_DIR="${1:?Usage: $0 <package-dir> [patch|minor|major|--no-bump]}"
BUMP="${2:-patch}"

if [ ! -f "$PKG_DIR/package.json" ]; then
  echo "Error: $PKG_DIR/package.json not found"
  exit 1
fi

PKG_NAME=$(grep '"name"' "$PKG_DIR/package.json" | head -1 | sed 's/.*"\(@[^"]*\)".*/\1/')
HAS_PUBLISH_CONFIG=$(grep -c '"publishConfig"' "$PKG_DIR/package.json" || true)

if [ "$HAS_PUBLISH_CONFIG" -eq 0 ]; then
  echo "Error: $PKG_NAME has no publishConfig — not a publishable package"
  exit 1
fi

echo "=== Publishing $PKG_NAME ==="

# Build first
echo "Building $PKG_NAME..."
cd "$PKG_DIR"

if grep -q '"build"' package.json; then
  bun run build
fi

# Bump version (unless --no-bump)
if [ "$BUMP" != "--no-bump" ]; then
  echo "Bumping version ($BUMP)..."
  npm version "$BUMP" --no-git-tag-version
fi

VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
echo "Version: $VERSION"

# Publish with bun (resolves workspace:* → real versions)
echo "Publishing $PKG_NAME@$VERSION..."
bun publish --access public

echo ""
echo "=== Published $PKG_NAME@$VERSION ==="
echo ""
echo "Verify: npm view $PKG_NAME@$VERSION dependencies"
