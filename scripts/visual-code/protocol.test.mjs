import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  decodeFrame,
  encodeFrame,
  readFrame,
  validateInput,
  validateMedia,
} from './protocol.mjs';

const input = {
  id: `revision-1-0-${'a'.repeat(64)}`,
  sourceCode: 'export const VisualComposition = () => null;',
  settings: { width: 1080, height: 1920, fps: 30, durationFrames: 450 },
  props: {},
  assets: [],
  outputs: [{ format: 'mp4' }],
  mode: 'preview',
};
test('framing rejects trailing, truncated, oversized and invalid JSON payloads', async () => {
  const frame = encodeFrame(input);
  assert.deepEqual(decodeFrame(frame), input);
  assert.throws(() => decodeFrame(frame.subarray(0, -1)));
  assert.throws(() => decodeFrame(Buffer.concat([frame, Buffer.from('junk')])));
  assert.throws(() => encodeFrame(input, 5));
  assert.deepEqual(
    await readFrame(Readable.from([frame.subarray(0, 3), frame.subarray(3)])),
    input,
  );
});
test('request boundary rejects traversal, remote assets, bad settings and extra properties', () => {
  assert.deepEqual(validateInput(input), input);
  for (const change of [
    { id: '../host' },
    { settings: { ...input.settings, width: 1921 } },
    { settings: { ...input.settings, durationFrames: 901 } },
    { env: { SECRET: 'bad' } },
    { assets: [{ id: '../x', mime: 'image/png', bytes: '' }] },
    { outputs: [{ format: 'mp4' }, { format: 'mp4' }] },
  ]) {
    assert.throws(() => validateInput({ ...input, ...change }));
  }
});
test('output validation refuses MIME spoofing and unexpected dimensions', () => {
  assert.throws(() =>
    validateMedia(
      {
        format: 'png',
        width: 1080,
        height: 1920,
        bytes: Buffer.from('not an image').toString('base64'),
      },
      input.settings,
    ),
  );
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(512, 16);
  png.writeUInt32BE(512, 20);
  assert.throws(() =>
    validateMedia(
      {
        format: 'png',
        width: 1080,
        height: 1920,
        bytes: png.toString('base64'),
      },
      input.settings,
    ),
  );
});

const sfntHeader = (tag) => {
  const bytes = Buffer.alloc(64, 1);
  if (typeof tag === 'string') bytes.write(tag, 0, 'ascii');
  else bytes.writeUInt32BE(tag, 0);
  return bytes;
};
const FONT_FILES = {
  'font/woff2': sfntHeader('wOF2'),
  'font/woff': sfntHeader('wOFF'),
  'font/ttf': sfntHeader(0x00010000),
  'font/otf': sfntHeader('OTTO'),
};
const brandFace = { family: 'Brand Display', weight: 700, style: 'normal' };
const fontAsset = (id, mime = 'font/woff2', extra = {}) => ({
  id,
  mime,
  bytes: FONT_FILES[mime].toString('base64'),
  faces: [brandFace],
  ...extra,
});
const pngBytes = Buffer.alloc(32);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(pngBytes);
const imageAsset = (index) => ({
  id: `image-${index}`,
  mime: 'image/png',
  bytes: pngBytes.toString('base64'),
});
test('brand fonts in every supported format are staged with their faces', () => {
  for (const mime of Object.keys(FONT_FILES)) {
    const staged = { ...input, assets: [fontAsset('brand-font', mime)] };
    assert.deepEqual(validateInput(staged), staged);
  }
  const withoutFaces = {
    ...input,
    assets: [fontAsset('brand-font', 'font/woff2', { faces: undefined })],
  };
  assert.doesNotThrow(() => validateInput(withoutFaces));
});
test('a font is refused when its type, bytes or faces do not hold', () => {
  const faces = (change) => [{ ...brandFace, ...change }];
  const cases = {
    'unsupported type': [fontAsset('f', 'font/woff2', { mime: 'font/eot' })],
    'a woff2 label on woff bytes': [
      fontAsset('f', 'font/woff2', {
        bytes: FONT_FILES['font/woff'].toString('base64'),
      }),
    ],
    'a ttf label on otf bytes': [
      fontAsset('f', 'font/ttf', {
        bytes: FONT_FILES['font/otf'].toString('base64'),
      }),
    ],
    'an image labelled as a font': [
      fontAsset('f', 'font/woff2', { bytes: pngBytes.toString('base64') }),
    ],
    'faces on an image': [{ ...imageAsset(0), faces: [brandFace] }],
    'no faces listed': [fontAsset('f', 'font/woff2', { faces: [] })],
    'an unknown face field': [
      fontAsset('f', 'font/woff2', { faces: faces({ src: 'x' }) }),
    ],
    'a css-breaking family': [
      fontAsset('f', 'font/woff2', { faces: faces({ family: 'a";}body{' }) }),
    ],
    'a weight above 900': [
      fontAsset('f', 'font/woff2', { faces: faces({ weight: 1000 }) }),
    ],
    'a fractional weight': [
      fontAsset('f', 'font/woff2', { faces: faces({ weight: 400.5 }) }),
    ],
    'an unknown style': [
      fontAsset('f', 'font/woff2', { faces: faces({ style: 'slanted' }) }),
    ],
    'a duplicate id': [fontAsset('f'), fontAsset('f')],
  };
  for (const [name, assets] of Object.entries(cases))
    assert.throws(() => validateInput({ ...input, assets }), undefined, name);
});
test('media and brand fonts are capped separately', () => {
  const images = (count) =>
    Array.from({ length: count }, (_, index) => imageAsset(index));
  const fonts = (count) =>
    Array.from({ length: count }, (_, index) => fontAsset(`font-${index}`));
  assert.doesNotThrow(() =>
    validateInput({ ...input, assets: [...images(12), ...fonts(8)] }),
  );
  assert.throws(() => validateInput({ ...input, assets: images(13) }));
  assert.throws(() =>
    validateInput({ ...input, assets: [...images(12), ...fonts(9)] }),
  );
  assert.throws(() => validateInput({ ...input, assets: fonts(9) }));
});
