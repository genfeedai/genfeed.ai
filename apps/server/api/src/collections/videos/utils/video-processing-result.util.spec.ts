import { describe, expect, it } from 'vitest';

import { requireVideoOutputPath } from './video-processing-result.util';

describe('requireVideoOutputPath', () => {
  it('returns a non-empty output path', () => {
    expect(requireVideoOutputPath('/tmp/video.mp4')).toBe('/tmp/video.mp4');
  });

  it.each([
    [''],
    [null],
    [undefined],
    [123],
    [{}],
  ])('rejects %p as a missing output path', (value) => {
    expect(() => requireVideoOutputPath(value)).toThrow(
      'Video processing result missing outputPath',
    );
  });
});
