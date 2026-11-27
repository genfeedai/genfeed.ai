import type { AnnotationShapeData } from '@genfeedai/contracts/types';
import { buildAnnotationSvg } from '@genfeedai/workflows/engine';
import { traced } from '@libs/tracing/traced';
import sharp from 'sharp';

/** Largest source image an annotation node reads, in bytes and decoded pixels. */
export const ANNOTATION_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
const ANNOTATION_SOURCE_MAX_PIXELS = 50_000_000;

export interface AnnotatedImage {
  data: Buffer;
  height: number;
  width: number;
}

/** Reads a stream into memory, refusing one that grows past `maxBytes`. */
export const readStreamCapped = traced(
  'readStreamCapped',
  async (stream: NodeJS.ReadableStream, maxBytes: number): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        throw new Error(
          `The source image is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`,
        );
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  },
);

/**
 * Draws the shapes over the image as a PNG. EXIF rotation is applied first, so the normalized
 * coordinates land where the editor showed them.
 */
export const renderAnnotatedImage = traced(
  'renderAnnotatedImage',
  async (
    source: Buffer,
    shapes: readonly AnnotationShapeData[],
  ): Promise<AnnotatedImage> => {
    const upright = await sharp(source, {
      limitInputPixels: ANNOTATION_SOURCE_MAX_PIXELS,
    })
      .rotate()
      .toBuffer({ resolveWithObject: true });
    const { height, width } = upright.info;
    const svg = buildAnnotationSvg(shapes, width, height);
    const data = await sharp(upright.data)
      .composite([{ input: Buffer.from(svg) }])
      .png()
      .toBuffer();
    return { data, height, width };
  },
);
