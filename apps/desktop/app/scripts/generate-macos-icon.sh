#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_ICON="${ROOT_DIR}/assets/app-icon.svg"
ICONSET_DIR="${ROOT_DIR}/build/icon.iconset"
OUTPUT_ICON="${ROOT_DIR}/build/icon.icns"
RASTER_SOURCE="${ROOT_DIR}/build/app-icon-1024.png"

if [[ ! -f "${SOURCE_ICON}" ]]; then
  echo "Source icon not found: ${SOURCE_ICON}" >&2
  exit 1
fi

mkdir -p "${ROOT_DIR}/build"
rm -rf "${ICONSET_DIR}"
mkdir -p "${ICONSET_DIR}"

if node -e "require.resolve('sharp')" >/dev/null 2>&1; then
  node -e "const sharp = require('sharp'); sharp(process.argv[1]).resize(1024, 1024).png().toFile(process.argv[2])" "${SOURCE_ICON}" "${RASTER_SOURCE}"
elif command -v magick >/dev/null 2>&1; then
  magick -background none "${SOURCE_ICON}" -resize 1024x1024 "${RASTER_SOURCE}"
else
  echo "Cannot render ${SOURCE_ICON}: install sharp or ImageMagick." >&2
  exit 1
fi

sips -z 16 16 "${RASTER_SOURCE}" --out "${ICONSET_DIR}/icon_16x16.png" >/dev/null
sips -z 32 32 "${RASTER_SOURCE}" --out "${ICONSET_DIR}/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "${RASTER_SOURCE}" --out "${ICONSET_DIR}/icon_32x32.png" >/dev/null
sips -z 64 64 "${RASTER_SOURCE}" --out "${ICONSET_DIR}/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "${RASTER_SOURCE}" --out "${ICONSET_DIR}/icon_128x128.png" >/dev/null
sips -z 256 256 "${RASTER_SOURCE}" --out "${ICONSET_DIR}/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "${RASTER_SOURCE}" --out "${ICONSET_DIR}/icon_256x256.png" >/dev/null
sips -z 512 512 "${RASTER_SOURCE}" --out "${ICONSET_DIR}/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "${RASTER_SOURCE}" --out "${ICONSET_DIR}/icon_512x512.png" >/dev/null
sips -z 1024 1024 "${RASTER_SOURCE}" --out "${ICONSET_DIR}/icon_512x512@2x.png" >/dev/null

iconutil -c icns "${ICONSET_DIR}" -o "${OUTPUT_ICON}"

echo "Generated macOS icon at ${OUTPUT_ICON}"
