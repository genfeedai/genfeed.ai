import type { ILogoUploadIntake } from '@api/collections/assets/interfaces/logo-upload-intake.interface';
import {
  SvgLogoRejectedError,
  sanitizeSvgLogo,
} from '@api/collections/assets/utils/svg-logo-sanitizer.util';
import { ASSET_ORIGINAL_FORMAT_SVG } from '@genfeedai/contracts/constants';
import { traced } from '@libs/tracing/traced';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

const SVG_UPLOAD_MIME_TYPE = 'image/svg+xml';
const SVG_EXTENSION_PATTERN = /\.svg$/i;
/** Refuse images larger than a 10,000 × 10,000 canvas before decoding them. */
const IMAGE_MAX_PIXELS = 100_000_000;
const RASTER_FORMATS = new Set(['gif', 'jpeg', 'png', 'webp']);

function isSvgUpload(
  file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>,
): boolean {
  return (
    file.mimetype === SVG_UPLOAD_MIME_TYPE ||
    SVG_EXTENSION_PATTERN.test(file.originalname ?? '')
  );
}

/** The nominal size sharp reads from an image, when it can read one. */
async function readSize(
  bytes: Buffer,
): Promise<{ format?: string; height?: number; width?: number }> {
  try {
    const { format, height, width } = await sharp(bytes, {
      limitInputPixels: IMAGE_MAX_PIXELS,
    }).metadata();
    return { format, height, width };
  } catch {
    return {};
  }
}

/**
 * What a logo or banner upload stores (#9706). An SVG is sanitized first:
 * the files service rasterizes the clean markup to the PNG every consumer
 * renders, and the same markup is kept as the vector original. A raster
 * upload passes through unchanged. Both record their format and size.
 */
export const readLogoUploadIntake = traced(
  'readLogoUploadIntake',
  async (
    file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname'>,
    isVectorAllowed: boolean,
  ): Promise<ILogoUploadIntake> => {
    if (!isSvgUpload(file)) {
      const { format, height, width } = await readSize(file.buffer);
      return {
        body: file.buffer,
        contentType: file.mimetype,
        ...(format && RASTER_FORMATS.has(format)
          ? {
              originalFormat: format,
              originalHeight: height,
              originalWidth: width,
            }
          : {}),
      };
    }

    if (!isVectorAllowed) {
      throw new BadRequestException('svg_upload_brand_logo_only');
    }
    let vector: Buffer;
    try {
      vector = sanitizeSvgLogo(file.buffer);
    } catch (error: unknown) {
      if (error instanceof SvgLogoRejectedError) {
        throw new BadRequestException(error.reason);
      }
      throw error;
    }
    const { format, height, width } = await readSize(vector);
    if (format !== ASSET_ORIGINAL_FORMAT_SVG || !width || !height) {
      // librsvg needs a size: an SVG without width/height or a viewBox, or one
      // it cannot parse, would store an empty logo.
      throw new BadRequestException('svg_logo_unreadable');
    }
    return {
      body: vector,
      contentType: SVG_UPLOAD_MIME_TYPE,
      originalFormat: ASSET_ORIGINAL_FORMAT_SVG,
      originalHeight: height,
      originalWidth: width,
      vector,
    };
  },
);
