#!/usr/bin/env bash
#
# Prepare or publish one already-versioned @genfeedai/* package.
# Version changes must land on master through a pull request first.
#
# Usage:
#   ./scripts/publish-package.sh packages/enums
#   ./scripts/publish-package.sh packages/enums --dry-run
#   ./scripts/publish-package.sh packages/enums --publish

set -euo pipefail

usage() {
  echo "Usage: $0 <package-dir> [--dry-run|--publish]"
  exit 1
}

PKG_DIR="${1:-}"
if [ -z "${PKG_DIR}" ]; then
  usage
fi
shift

MODE="dry-run"
for arg in "$@"; do
  case "${arg}" in
    --dry-run)
      MODE="dry-run"
      ;;
    --publish)
      MODE="publish"
      ;;
    patch|minor|major|--no-bump)
      echo "Error: version bumps are not allowed during publication. Merge the version through a PR first."
      exit 1
      ;;
    *)
      echo "Unknown argument: ${arg}"
      usage
      ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
ABS_PKG_DIR="$(cd "${PKG_DIR}" && pwd -P)"
PACKAGE_PATH="${ABS_PKG_DIR#"${REPO_ROOT}/"}"

if [ ! -f "${ABS_PKG_DIR}/package.json" ]; then
  echo "Error: ${PKG_DIR}/package.json not found"
  exit 1
fi

PACKAGE_REQUEST="$(node -e '
  const fs = require("node:fs");
  const packagePath = process.argv[1];
  const packageDir = process.argv[2];
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  process.stdout.write(JSON.stringify([{ path: packageDir, version: pkg.version }]));
' "${ABS_PKG_DIR}/package.json" "${PACKAGE_PATH}")"

OUTPUT_DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/genfeed-package-release"
cd "${REPO_ROOT}"
node scripts/publish-packages-from-json.mjs \
  --packages-json "${PACKAGE_REQUEST}" \
  --output-dir "${OUTPUT_DIR}"

if [ "${MODE}" = "publish" ]; then
  node scripts/publish-packages-from-json.mjs \
    --publish-plan "${OUTPUT_DIR}/release-plan.json"
fi
