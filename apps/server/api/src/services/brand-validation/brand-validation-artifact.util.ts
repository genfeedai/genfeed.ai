import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function assertBrandArtifactBytes(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new TypeError('brand_validation_invalid_bytes');
  }
  if (bytes.byteLength > 20_971_520) {
    throw new RangeError('brand_validation_artifact_size_limit');
  }
}

export function hashBrandArtifactBytes(bytes: Uint8Array): string {
  assertBrandArtifactBytes(bytes);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function decodeBrandTextBytes(bytes: Uint8Array): string {
  assertBrandArtifactBytes(bytes);
  const copy = Buffer.from(bytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      copy,
    );
  } catch {
    throw new TypeError('brand_validation_invalid_utf8');
  }
  if (text.length > 100_000) {
    throw new RangeError('brand_validation_text_size_limit');
  }
  return text;
}

function assertSupportedBrandPng(bytes: Buffer): void {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('brand_validation_png_format_unsupported');
  }
  let offset = 8;
  let chunks = 0;
  let headerSeen = false;
  let srgbSeen = false;
  let densitySeen = false;
  let idatSeen = false;
  let idatBytes = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) {
      throw new TypeError('brand_validation_invalid_png');
    }
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) {
      throw new TypeError('brand_validation_invalid_png');
    }
    chunks++;
    if (chunks > 1024) {
      throw new RangeError('brand_validation_png_chunk_limit');
    }
    for (let index = offset + 4; index < offset + 8; index++) {
      const letter = bytes[index];
      if (
        !((letter >= 65 && letter <= 90) || (letter >= 97 && letter <= 122))
      ) {
        throw new TypeError('brand_validation_invalid_png');
      }
    }
    if (bytes[offset + 6] < 65 || bytes[offset + 6] > 90) {
      throw new TypeError('brand_validation_invalid_png');
    }
    const payload = offset + 8;
    const end = payload + length;
    if (crc32(bytes.subarray(offset + 4, end)) !== bytes.readUInt32BE(end)) {
      throw new TypeError('brand_validation_invalid_png');
    }
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!headerSeen && type !== 'IHDR') {
      throw new TypeError('brand_validation_invalid_png');
    }
    if (type === 'IHDR') {
      if (headerSeen || chunks !== 1 || length !== 13) {
        throw new TypeError('brand_validation_invalid_png');
      }
      headerSeen = true;
      const width = bytes.readUInt32BE(payload);
      const height = bytes.readUInt32BE(payload + 4);
      if (
        width === 0 ||
        height === 0 ||
        bytes[payload + 10] !== 0 ||
        bytes[payload + 11] !== 0 ||
        bytes[payload + 12] > 1
      ) {
        throw new TypeError('brand_validation_invalid_png');
      }
      if (width > 1920 || height > 1080) {
        throw new RangeError('brand_validation_image_size_limit');
      }
      if (
        bytes[payload + 8] !== 8 ||
        ![2, 6].includes(bytes[payload + 9]) ||
        bytes[payload + 12] !== 0
      ) {
        throw new Error('brand_validation_png_encoding_unsupported');
      }
    } else if (type === 'sRGB') {
      if (srgbSeen || idatSeen || length !== 1 || bytes[payload] > 3) {
        throw new TypeError('brand_validation_invalid_png');
      }
      srgbSeen = true;
    } else if (type === 'pHYs') {
      if (densitySeen || idatSeen || length !== 9 || bytes[payload + 8] > 1) {
        throw new TypeError('brand_validation_invalid_png');
      }
      densitySeen = true;
    } else if (type === 'IDAT') {
      idatSeen = true;
      idatBytes += length;
    } else if (type === 'IEND') {
      if (
        length !== 0 ||
        !idatSeen ||
        idatBytes === 0 ||
        end + 4 !== bytes.length
      ) {
        throw new TypeError('brand_validation_invalid_png');
      }
      return;
    } else {
      throw new Error('brand_validation_png_metadata_unsupported');
    }
    offset = end + 4;
  }
  throw new TypeError('brand_validation_invalid_png');
}

export async function decodeBrandPngBytes(bytes: Uint8Array) {
  assertBrandArtifactBytes(bytes);
  const copy = Buffer.from(bytes);
  assertSupportedBrandPng(copy);
  const width = copy.readUInt32BE(16);
  const height = copy.readUInt32BE(20);
  const rgba = copy[25] === 6;
  const image = (() => {
    try {
      return sharp(copy, {
        failOn: 'warning',
        limitInputPixels: 2_073_600,
        limitInputChannels: 4,
        unlimited: false,
        autoOrient: false,
      });
    } catch {
      throw new TypeError('brand_validation_invalid_png');
    }
  })();
  const metadata = await Promise.resolve()
    .then(() => image.metadata())
    .catch(() => {
      throw new TypeError('brand_validation_invalid_png');
    });
  if (
    metadata.format !== 'png' ||
    metadata.width !== width ||
    metadata.height !== height ||
    metadata.space !== 'srgb' ||
    metadata.depth !== 'uchar' ||
    metadata.bitsPerSample !== 8 ||
    metadata.channels !== (rgba ? 4 : 3) ||
    metadata.hasAlpha !== rgba ||
    metadata.isProgressive ||
    metadata.isPalette ||
    metadata.hasProfile ||
    metadata.icc !== undefined ||
    metadata.exif !== undefined ||
    metadata.orientation !== undefined ||
    (metadata.pages !== undefined && metadata.pages !== 1) ||
    (metadata.pageHeight !== undefined && metadata.pageHeight !== height) ||
    metadata.delay !== undefined ||
    metadata.loop !== undefined
  ) {
    throw new Error('brand_validation_png_metadata_unsupported');
  }
  const result = await Promise.resolve()
    .then(() =>
      image
        .ensureAlpha(1)
        .raw({ depth: 'uchar' })
        .toBuffer({ resolveWithObject: true }),
    )
    .catch(() => {
      throw new TypeError('brand_validation_invalid_png');
    });
  const { data, info } = result;
  if (
    info.width !== width ||
    info.height !== height ||
    info.format !== 'raw' ||
    info.channels !== 4 ||
    info.hasAlpha !== true ||
    info.size !== width * height * 4 ||
    info.premultiplied !== false ||
    data.byteLength !== info.size ||
    !('depth' in info) ||
    info.depth !== 'uchar'
  ) {
    throw new TypeError('brand_validation_invalid_png');
  }
  return result;
}
