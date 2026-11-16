import { traced } from '@libs/tracing/traced';
import sharp from 'sharp';

/** Bluesky rejects an image blob larger than this (app.bsky.embed.images). */
export const BLUESKY_MAX_IMAGE_BYTES = 1_000_000;

const PASSTHROUGH_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const LONGEST_EDGES = [2048, 1600, 1200, 900, 600] as const;
const JPEG_QUALITIES = [85, 70, 55] as const;

export interface PreparedBlueskyImage {
  buffer: Buffer;
  height: number;
  mimeType: string;
  width: number;
}

/**
 * An image Bluesky will accept. A small JPEG, PNG or WebP goes up unchanged;
 * anything else, or anything over 1 MB, is re-encoded as a JPEG at the largest
 * size and quality that fits. An animated image becomes its first frame.
 */
export const prepareBlueskyImage = traced(
  'prepareBlueskyImage',
  async (
    input: Buffer,
    declaredType: string,
  ): Promise<PreparedBlueskyImage> => {
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Bluesky image has no readable dimensions');
    }

    const mimeType = declaredType.split(';')[0].trim().toLowerCase();
    if (
      input.byteLength <= BLUESKY_MAX_IMAGE_BYTES &&
      PASSTHROUGH_TYPES.has(mimeType)
    ) {
      return {
        buffer: input,
        height: metadata.height,
        mimeType,
        width: metadata.width,
      };
    }

    for (const edge of LONGEST_EDGES) {
      for (const quality of JPEG_QUALITIES) {
        const { data, info } = await sharp(input)
          .rotate()
          .resize({
            fit: 'inside',
            height: edge,
            width: edge,
            withoutEnlargement: true,
          })
          .flatten({ background: '#ffffff' })
          .jpeg({ mozjpeg: true, quality })
          .toBuffer({ resolveWithObject: true });
        if (data.byteLength <= BLUESKY_MAX_IMAGE_BYTES) {
          return {
            buffer: data,
            height: info.height,
            mimeType: 'image/jpeg',
            width: info.width,
          };
        }
      }
    }

    throw new Error('Bluesky image could not be reduced below 1 MB');
  },
);
