import { randomBytes } from 'node:crypto';
import {
  BLUESKY_MAX_IMAGE_BYTES,
  prepareBlueskyImage,
} from '@api/services/integrations/bluesky/utils/bluesky-image.util';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

async function noisyPng(width: number, height: number): Promise<Buffer> {
  const channels = 3;
  const raw = randomBytes(width * height * channels);
  return sharp(raw, { raw: { channels, height, width } }).png().toBuffer();
}

describe('prepareBlueskyImage', () => {
  it('uploads a small PNG unchanged with its real dimensions', async () => {
    const input = await sharp({
      create: {
        background: '#336699',
        channels: 3,
        height: 40,
        width: 80,
      },
    })
      .png()
      .toBuffer();

    const prepared = await prepareBlueskyImage(input, 'image/png');

    expect(prepared.buffer.equals(input)).toBe(true);
    expect(prepared).toMatchObject({
      height: 40,
      mimeType: 'image/png',
      width: 80,
    });
  });

  it('re-encodes an image over 1 MB as a JPEG that fits', async () => {
    const input = await noisyPng(1400, 1400);
    expect(input.byteLength).toBeGreaterThan(BLUESKY_MAX_IMAGE_BYTES);

    const prepared = await prepareBlueskyImage(input, 'image/png');

    expect(prepared.mimeType).toBe('image/jpeg');
    expect(prepared.buffer.byteLength).toBeLessThanOrEqual(
      BLUESKY_MAX_IMAGE_BYTES,
    );
    expect(prepared.width).toBeLessThanOrEqual(1400);
  });

  it('turns a GIF into a static JPEG', async () => {
    const input = await sharp({
      create: { background: '#ff0000', channels: 3, height: 20, width: 20 },
    })
      .gif()
      .toBuffer();

    const prepared = await prepareBlueskyImage(input, 'image/gif');

    expect(prepared.mimeType).toBe('image/jpeg');
  });
});
