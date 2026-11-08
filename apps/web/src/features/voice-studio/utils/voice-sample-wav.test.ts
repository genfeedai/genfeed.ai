import { describe, expect, it } from 'vitest';
import {
  encodeWav,
  rmsLevel,
} from '@/features/voice-studio/utils/voice-sample-wav';

async function header(blob: Blob) {
  const view = new DataView(await blob.arrayBuffer());
  const text = (offset: number) =>
    String.fromCharCode(
      ...Array.from({ length: 4 }, (_, index) => view.getUint8(offset + index)),
    );
  return {
    channels: view.getUint16(22, true),
    dataSize: view.getUint32(40, true),
    format: `${text(0)}/${text(8)}/${text(36)}`,
    sampleRate: view.getUint32(24, true),
    size: blob.size,
  };
}

describe('encodeWav', () => {
  it('writes a mono 16-bit PCM WAV of the right length', async () => {
    const blob = encodeWav(new Float32Array(24_000), 24_000);

    expect(blob.type).toBe('audio/wav');
    expect(await header(blob)).toEqual({
      channels: 1,
      dataSize: 48_000,
      format: 'RIFF/WAVE/data',
      sampleRate: 24_000,
      size: 48_044,
    });
  });

  it('clips samples outside the full-scale range', async () => {
    const view = new DataView(
      await encodeWav(new Float32Array([2, -2, 0.5]), 24_000).arrayBuffer(),
    );

    expect([
      view.getInt16(44, true),
      view.getInt16(46, true),
      view.getInt16(48, true),
    ]).toEqual([32_767, -32_768, 16_383]);
  });
});

describe('rmsLevel', () => {
  it.each([
    [new Float32Array(0), 0],
    [new Float32Array(100), 0],
    [new Float32Array([0.5, -0.5, 0.5, -0.5]), 0.5],
  ])('measures the level of %#', (samples, expected) => {
    expect(rmsLevel(samples)).toBeCloseTo(expected);
  });
});
