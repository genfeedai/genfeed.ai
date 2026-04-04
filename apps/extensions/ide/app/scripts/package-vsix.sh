#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="${ROOT_DIR}/.vsce-tmp"
VSCE_BIN="${ROOT_DIR}/node_modules/.bin/vsce"

if [[ ! -x "${VSCE_BIN}" ]]; then
  echo "vsce binary not found at ${VSCE_BIN}" >&2
  exit 1
fi

rm -rf "${TMP_DIR}"
mkdir -p "${TMP_DIR}"

cp -R "${ROOT_DIR}/dist" "${ROOT_DIR}/assets" "${ROOT_DIR}/package.json" "${TMP_DIR}"

TMP_PACKAGE_JSON="${TMP_DIR}/package.json"
TMP_PACKAGE_JSON="${TMP_PACKAGE_JSON}" node <<'NODE'
const fs = require('fs');

const packagePath = process.env.TMP_PACKAGE_JSON;
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageJson.scripts = {
  ...(packageJson.scripts || {}),
  'vscode:prepublish': 'echo "Skipping prepublish in staged VSIX package"',
};
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
NODE

if [[ -f "${ROOT_DIR}/README.md" ]]; then
  cp "${ROOT_DIR}/README.md" "${TMP_DIR}"
fi

if [[ -f "${ROOT_DIR}/LICENSE" ]]; then
  cp "${ROOT_DIR}/LICENSE" "${TMP_DIR}"
fi

(
  cd "${TMP_DIR}"
  "${VSCE_BIN}" package --allow-missing-repository --no-dependencies
)

mv "${TMP_DIR}"/*.vsix "${ROOT_DIR}/"
rm -rf "${TMP_DIR}"

echo "VSIX package created in ${ROOT_DIR}"
