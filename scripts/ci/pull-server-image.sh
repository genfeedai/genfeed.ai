#!/usr/bin/env bash
set -euo pipefail

[[ "${SOURCE_SHA:-}" =~ ^[0-9a-f]{40}$ ]]
[[ "${SERVER_IMAGE_DIGEST:-}" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ "${GITHUB_REPOSITORY:-}" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]]
reference="ghcr.io/${GITHUB_REPOSITORY,,}/server@$SERVER_IMAGE_DIGEST"
docker pull "$reference"
revision="$(docker image inspect "$reference" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')"
if [[ "$revision" != "$SOURCE_SHA" ]]; then
  echo '::error::Published server image revision does not match the inspected source SHA.' >&2
  exit 1
fi
