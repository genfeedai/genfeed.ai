#!/usr/bin/env bash
#
# Publish a @genfeedai/* package to npm.
#
# Uses `bun publish` which automatically resolves workspace:* protocols
# to real versions. Never use `npm publish` — it publishes workspace:*
# literally, breaking external consumers.
#
# Usage:
#   ./scripts/publish-package.sh packages/enums                    # patch bump + publish
#   ./scripts/publish-package.sh packages/interfaces minor         # minor bump + publish
#   ./scripts/publish-package.sh packages/cli major               # major bump + publish
#   ./scripts/publish-package.sh packages/enums --no-bump         # publish current version
#   ./scripts/publish-package.sh packages/enums patch --dry-run   # dry-run publish
#
# Requirements:
#   - bun >= 1.2 (for workspace:* resolution)
#   - NPM_TOKEN env var or ~/.npmrc with auth
#   - Clean git working tree

set -euo pipefail

usage() {
  echo "Usage: $0 <package-dir> [patch|minor|major|--no-bump] [--dry-run]"
  exit 1
}

PKG_DIR="${1:-}"
if [ -z "$PKG_DIR" ]; then
  usage
fi
shift

BUMP="patch"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    patch|minor|major|--no-bump)
      BUMP="$arg"
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    *)
      echo "Unknown argument: $arg"
      usage
      ;;
  esac
done

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

# Ensure clean working tree before publishing
if ! git diff-index --quiet HEAD --; then
  echo "Error: Working tree must be clean before publishing."
  exit 1
fi

# Build first
echo "Building $PKG_NAME..."
cd "$PKG_DIR"
ORIGINAL_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')

if grep -q '"build"' package.json; then
  bun run build
fi

# Bump version (unless --no-bump)
if [ "$BUMP" != "--no-bump" ]; then
  echo "Bumping version ($BUMP)..."
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");

    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const [major, minor, patch] = packageJson.version.split(".").map(Number);

    if (![major, minor, patch].every((part) => Number.isInteger(part))) {
      throw new Error(`Unsupported version format: ${packageJson.version}`);
    }

    const bump = process.argv[1];
    let nextVersion;
    switch (bump) {
      case "major":
        nextVersion = `${major + 1}.0.0`;
        break;
      case "minor":
        nextVersion = `${major}.${minor + 1}.0`;
        break;
      case "patch":
        nextVersion = `${major}.${minor}.${patch + 1}`;
        break;
      default:
        throw new Error(`Unsupported bump type: ${bump}`);
    }

    packageJson.version = nextVersion;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    console.log(nextVersion);
  ' "$BUMP"
fi

VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
echo "Version: $VERSION"

# Publish with bun (resolves workspace:* → real versions)
if [ "$DRY_RUN" = true ]; then
  echo "Dry-run publishing $PKG_NAME@$VERSION..."
  bun publish --access public --provenance --dry-run
else
  echo "Publishing $PKG_NAME@$VERSION..."
  bun publish --access public --provenance
fi

echo ""
if [ "$DRY_RUN" = true ]; then
  if [ "$BUMP" != "--no-bump" ]; then
    node -e '
      const fs = require("node:fs");
      const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
      packageJson.version = process.argv[1];
      fs.writeFileSync("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
    ' "$ORIGINAL_VERSION"
  fi
  echo "=== Dry run complete for $PKG_NAME@$VERSION ==="
else
  echo "=== Published $PKG_NAME@$VERSION ==="
  echo ""
  echo "Verifying published manifest..."
  DEPENDENCIES_JSON=$(npm view "$PKG_NAME@$VERSION" dependencies --json)
  echo "$DEPENDENCIES_JSON"
  node -e '
    const dependencies = process.argv[1] ? JSON.parse(process.argv[1]) : {};
    for (const [name, version] of Object.entries(dependencies ?? {})) {
      if (typeof version === "string" && version.startsWith("workspace:")) {
        console.error(`Published dependency ${name} retained workspace protocol (${version})`);
        process.exit(1);
      }
    }
  ' "$DEPENDENCIES_JSON"
fi
