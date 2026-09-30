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
