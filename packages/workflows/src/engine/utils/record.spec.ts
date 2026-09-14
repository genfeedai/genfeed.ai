import { describe, expect, it } from 'vitest';
import { isRecord } from './record';

describe('isRecord', () => {
  it.each([null, undefined, '', 0, false, [], ['video']])(
    'rejects non-record payloads: %s',
    (value) => {
      expect(isRecord(value)).toBe(false);
    },
  );

  it('accepts an object payload and narrows its properties', () => {
    const value: unknown = { videoUrl: 'https://example.com/video.mp4' };
    if (!isRecord(value)) throw new Error('Expected an object payload');
    expect(value.videoUrl).toBe('https://example.com/video.mp4');
  });

  it('rejects an array carrying object-like properties', () => {
    expect(
      isRecord(
        Object.assign([], { videoUrl: 'https://example.com/video.mp4' }),
      ),
    ).toBe(false);
  });
});
