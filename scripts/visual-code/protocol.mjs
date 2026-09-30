import { createHash } from 'node:crypto';

export const MAX_BYTES = 64 * 1024 * 1024;
export const MAX_DIAGNOSTICS = 8192;
export const DEADLINE_MS = 120_000;
export const RENDERER_VERSION = '4.0.530';
const namePattern = /^[a-zA-Z0-9_-]{1,200}$/;
export function invariant(value, code) {
  if (!value) throw new Error(code);
}
function closed(value, keys) {
  invariant(
    value && typeof value === 'object' && !Array.isArray(value),
    'invalid_object',
  );
  invariant(
    Object.keys(value).every((key) => keys.includes(key)),
    'unknown_field',
  );
}
export function inputHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function encodeFrame(value, limit = MAX_BYTES) {
  const bytes = Buffer.from(JSON.stringify(value));
  invariant(bytes.length <= limit, 'frame_too_large');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  return Buffer.concat([header, bytes]);
}
export function decodeFrame(bytes, limit = MAX_BYTES) {
  invariant(bytes.length >= 4, 'truncated_frame');
  const length = bytes.readUInt32BE(0);
  invariant(
    length <= limit && bytes.length === length + 4,
    'invalid_frame_length',
  );
  return JSON.parse(bytes.subarray(4).toString('utf8'));
}
export async function readFrame(stream, limit = MAX_BYTES) {
  let size = 0;
  const chunks = [];
  for await (const chunk of stream) {
    size += chunk.length;
    invariant(size <= limit + 4, 'frame_too_large');
    chunks.push(chunk);
  }
  return decodeFrame(Buffer.concat(chunks), limit);
}
export function decodeBytes(value) {
  invariant(
    typeof value === 'string' &&
      value.length <= Math.ceil(MAX_BYTES / 3) * 4 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        value,
      ),
    'invalid_base64',
  );
  const bytes = Buffer.from(value, 'base64');
  invariant(bytes.length <= MAX_BYTES, 'media_too_large');
  return bytes;
}
export function validateSettings(settings) {
  closed(settings, ['width', 'height', 'fps', 'durationFrames']);
  for (const dimension of [settings.width, settings.height])
    invariant(
      Number.isInteger(dimension) &&
        dimension >= 256 &&
        dimension <= 1920 &&
        dimension % 2 === 0,
      'invalid_dimension',
    );
  invariant(settings.width * settings.height <= 1920 * 1080, 'pixel_limit');
  invariant([24, 30].includes(settings.fps), 'invalid_fps');
  invariant(
    Number.isInteger(settings.durationFrames) &&
      settings.durationFrames >= 1 &&
      settings.durationFrames <= 900 &&
      settings.durationFrames / settings.fps <= 30,
    'invalid_duration',
  );
  return settings;
}
export function validateInput(input) {
  closed(input, [
    'id',
    'sourceCode',
    'settings',
    'props',
    'assets',
    'outputs',
    'mode',
  ]);
  invariant(namePattern.test(input.id), 'invalid_id');
  invariant(
    typeof input.sourceCode === 'string' &&
      input.sourceCode.trim() &&
      Buffer.byteLength(input.sourceCode) <= 256 * 1024,
    'invalid_source',
  );
  validateSettings(input.settings);
  invariant(
    input.props &&
      typeof input.props === 'object' &&
      !Array.isArray(input.props) &&
      Buffer.byteLength(JSON.stringify(input.props)) <= 16 * 1024,
    'invalid_props',
  );
  invariant(['preview', 'export'].includes(input.mode), 'invalid_mode');
  invariant(
    Array.isArray(input.assets) && input.assets.length <= 12,
    'invalid_assets',
  );
  const ids = new Set();
  for (const asset of input.assets) {
    closed(asset, ['id', 'mime', 'bytes']);
    invariant(
      namePattern.test(asset.id) && !ids.has(asset.id),
      'invalid_asset_id',
    );
    ids.add(asset.id);
    invariant(
      [
        'image/png',
        'image/jpeg',
        'video/mp4',
        'audio/mpeg',
        'audio/wav',
        'font/woff2',
      ].includes(asset.mime),
      'invalid_asset_mime',
    );
    const bytes = decodeBytes(asset.bytes);
    invariant(bytes.length > 0, 'empty_asset');
    validateSignature(bytes, asset.mime);
  }
  invariant(
    Array.isArray(input.outputs) &&
      input.outputs.length > 0 &&
      input.outputs.length <= 8,
    'invalid_outputs',
  );
  const outputs = new Set();
  for (const output of input.outputs) {
    closed(output, ['format', 'frame']);
    invariant(['mp4', 'png', 'jpeg'].includes(output.format), 'invalid_format');
    invariant(
      output.format === 'mp4'
        ? output.frame === undefined
        : Number.isInteger(output.frame) &&
            output.frame >= 0 &&
            output.frame < input.settings.durationFrames,
      'invalid_frame',
    );
    const key = `${output.format}-${output.frame ?? ''}`;
    invariant(!outputs.has(key), 'duplicate_output');
    outputs.add(key);
  }
  invariant(
    Buffer.byteLength(JSON.stringify(input)) <= MAX_BYTES,
    'input_too_large',
  );
  return input;
}
export function validateSignature(bytes, mime) {
  const signatures = {
    'image/png': () =>
      bytes.length >= 24 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': () =>
      bytes.length > 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes.at(-2) === 255 &&
      bytes.at(-1) === 217,
    'video/mp4': () =>
      bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp',
    'audio/mpeg': () =>
      bytes.toString('ascii', 0, 3) === 'ID3' ||
      (bytes[0] === 255 && (bytes[1] & 224) === 224),
    'audio/wav': () =>
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WAVE',
    'font/woff2': () => bytes.toString('ascii', 0, 4) === 'wOF2',
  };
  invariant(signatures[mime]?.(), 'mime_signature_mismatch');
}
function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    invariant(bytes[offset] === 255, 'invalid_jpeg');
    const marker = bytes[offset + 1];
    offset += 2;
    const length = bytes.readUInt16BE(offset);
    invariant(length >= 2 && offset + length <= bytes.length, 'invalid_jpeg');
    if ([192, 193, 194].includes(marker))
      return {
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3),
      };
    offset += length;
  }
  throw new Error('missing_jpeg_dimensions');
}
export function validateMedia(media, settings) {
  closed(media, ['format', 'width', 'height', 'frame', 'bytes']);
  invariant(
    ['mp4', 'png', 'jpeg'].includes(media.format),
    'invalid_media_format',
  );
  invariant(
    media.width === settings.width && media.height === settings.height,
    'unexpected_dimensions',
  );
  const bytes = decodeBytes(media.bytes);
  validateSignature(
    bytes,
    media.format === 'mp4' ? 'video/mp4' : `image/${media.format}`,
  );
  if (media.format !== 'mp4') {
    const dims =
      media.format === 'png'
        ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
        : jpegDimensions(bytes);
    invariant(
      dims.width === settings.width && dims.height === settings.height,
      'encoded_dimensions_mismatch',
    );
  }
  return bytes;
}
export function validateResult(result, input) {
  closed(result, ['rendererVersion', 'media', 'diagnostics']);
  invariant(
    result.rendererVersion === RENDERER_VERSION,
    'renderer_version_mismatch',
  );
  invariant(
    Array.isArray(result.diagnostics) &&
      result.diagnostics.every((value) => typeof value === 'string') &&
      Buffer.byteLength(JSON.stringify(result.diagnostics)) <= MAX_DIAGNOSTICS,
    'invalid_diagnostics',
  );
  invariant(
    Array.isArray(result.media) && result.media.length <= 8,
    'invalid_media',
  );
  const expected =
    input.mode === 'preview'
      ? [
          0,
          Math.floor((input.settings.durationFrames - 1) / 2),
          input.settings.durationFrames - 1,
        ].map((frame) => ({ format: 'png', frame }))
      : input.outputs;
  invariant(
    result.diagnostics.length > 0
      ? result.media.length === 0
      : result.media.length === expected.length,
    'missing_outputs',
  );
  result.media.forEach((media, index) => {
    invariant(
      media.format === expected[index].format &&
        media.frame === expected[index].frame,
      'unexpected_output',
    );
    validateMedia(media, input.settings);
  });
  invariant(
    Buffer.byteLength(JSON.stringify(result)) <= MAX_BYTES,
    'result_too_large',
  );
  return result;
}
