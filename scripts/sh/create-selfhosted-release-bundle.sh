#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELEASE_TAG="${1:-}"
OUTPUT_DIR="${2:-${ROOT_DIR}/release}"

if [[ ! "${RELEASE_TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: $0 vX.Y.Z [output-directory]" >&2
  exit 1
fi

IMAGE_TAG="${RELEASE_TAG#v}"
BUNDLE_NAME="genfeed-selfhosted-${RELEASE_TAG}"
ARCHIVE_NAME="genfeed-selfhosted.tar.gz"
CHECKSUM_NAME="${ARCHIVE_NAME}.sha256"
BUNDLE_DIR="${OUTPUT_DIR}/${BUNDLE_NAME}"

mkdir -p "${OUTPUT_DIR}"
rm -rf "${BUNDLE_DIR}"
mkdir "${BUNDLE_DIR}"

cp "${ROOT_DIR}/docker/docker-compose.selfhosted.yml" "${BUNDLE_DIR}/compose.yml"
cp "${ROOT_DIR}/docker/.env.example" "${BUNDLE_DIR}/.env.example"

if grep -q '^GENFEED_IMAGE_TAG=' "${BUNDLE_DIR}/.env.example"; then
  sed -i.bak "s/^GENFEED_IMAGE_TAG=.*/GENFEED_IMAGE_TAG=${IMAGE_TAG}/" "${BUNDLE_DIR}/.env.example"
  rm "${BUNDLE_DIR}/.env.example.bak"
else
  printf '\n# Exact Community image for this release\nGENFEED_IMAGE_TAG=%s\n' \
    "${IMAGE_TAG}" >> "${BUNDLE_DIR}/.env.example"
fi

sed \
  -e "s/__RELEASE_TAG__/${RELEASE_TAG}/g" \
  -e "s/__IMAGE_TAG__/${IMAGE_TAG}/g" \
  "${ROOT_DIR}/docker/README.selfhosted-release.md" > "${BUNDLE_DIR}/README.md"

cat > "${BUNDLE_DIR}/release.json" <<EOF
{
  "schemaVersion": 1,
  "releaseTag": "${RELEASE_TAG}",
  "image": "ghcr.io/genfeedai/genfeed.ai:${IMAGE_TAG}"
}
EOF

rm -f "${OUTPUT_DIR}/${ARCHIVE_NAME}" "${OUTPUT_DIR}/${CHECKSUM_NAME}"
tar -C "${OUTPUT_DIR}" -czf "${OUTPUT_DIR}/${ARCHIVE_NAME}" "${BUNDLE_NAME}"
(
  cd "${OUTPUT_DIR}"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${ARCHIVE_NAME}" > "${CHECKSUM_NAME}"
  else
    shasum -a 256 "${ARCHIVE_NAME}" > "${CHECKSUM_NAME}"
  fi
)

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "release_tag=${RELEASE_TAG}"
    echo "image_tag=${IMAGE_TAG}"
    echo "archive=${OUTPUT_DIR}/${ARCHIVE_NAME}"
    echo "checksum=${OUTPUT_DIR}/${CHECKSUM_NAME}"
  } >> "${GITHUB_OUTPUT}"
fi

echo "Created ${OUTPUT_DIR}/${ARCHIVE_NAME} for ghcr.io/genfeedai/genfeed.ai:${IMAGE_TAG}"
