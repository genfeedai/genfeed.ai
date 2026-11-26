import { Readable } from 'node:stream';
import {
  readStreamCapped,
  renderAnnotatedImage,
} from '@api/collections/workflows/utils/annotation-image-render.util';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

async function whiteImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      background: { b: 255, g: 255, r: 255 },
      channels: 3,
      height,
      width,
    },
  })
    .png()
    .toBuffer();
}

describe('renderAnnotatedImage', () => {
  it('paints the shape where its fractions land and keeps the image size', async () => {
    const result = await renderAnnotatedImage(await whiteImage(200, 100), [
      { height: 0.5, id: 'a', kind: 'rectangle', width: 0.5, x: 0.25, y: 0.25 },
    ]);

    expect(result).toMatchObject({ height: 100, width: 200 });
    const { data, info } = await sharp(result.data)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return [data[offset], data[offset + 1], data[offset + 2]];
    };
    // The left edge of the rectangle is x = 50, y = 50: red, not white.
    expect(pixel(50, 50)).not.toEqual([255, 255, 255]);
    // The centre of the rectangle and the corner of the image stay white.
    expect(pixel(100, 50)).toEqual([255, 255, 255]);
    expect(pixel(2, 2)).toEqual([255, 255, 255]);
  });
});

describe('readStreamCapped', () => {
  it('returns the bytes of a stream within the cap', async () => {
    const bytes = await readStreamCapped(
      Readable.from([Buffer.from('abc')]),
      10,
    );
    expect(bytes.toString()).toBe('abc');
  });

  it('refuses a stream past the cap', async () => {
    await expect(
      readStreamCapped(Readable.from([Buffer.alloc(11)]), 10),
    ).rejects.toThrow('larger than');
  });
});
