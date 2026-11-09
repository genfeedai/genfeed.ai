import { detectRasterImageMimeType } from '@api/collections/brands/utils/raster-image-mime.util';
import { describe, expect, it } from 'vitest';

describe('detectRasterImageMimeType', () => {
  it.each([
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00], 'image/png'],
    [[0xff, 0xd8, 0xff, 0xe0], 'image/jpeg'],
    [[...Buffer.from('GIF89a'), 0x01], 'image/gif'],
    [
      [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 ')],
      'image/webp',
    ],
    [[...Buffer.from('<svg xmlns=')], undefined],
    [[], undefined],
  ])('reads %j as %s', (bytes, expected) => {
    expect(detectRasterImageMimeType(Uint8Array.from(bytes))).toBe(expected);
  });
});
