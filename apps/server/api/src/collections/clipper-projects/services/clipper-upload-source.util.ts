import { MAX_CLIP_SOURCE_SIZE_BYTES } from '@api/collections/clipper-projects/dto/prepare-clipper-upload.dto';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { CLIPPER_SOURCE_MAX_DURATION_SECONDS } from '@genfeedai/contracts/constants';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

export interface AcceptedUploadedSource {
  durationSeconds: number;
  sizeBytes: number;
}

/**
 * Validates a stored clip source and returns its probed size and duration.
 * The media type is the allowlist-checked type recorded when the upload was
 * prepared, so a valid audio or video file always carries it.
 */
export function readAcceptedUploadedSource(
  ingredient: IngredientDocument,
): AcceptedUploadedSource {
  const durationSeconds = ingredient.metadata?.duration;
  const sizeBytes = ingredient.metadata?.size;
  if (
    typeof sizeBytes !== 'number' ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes <= 0
  ) {
    throw new BadRequestException(
      'The uploaded clip source size is unavailable.',
    );
  }
  if (
    typeof durationSeconds !== 'number' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    throw new BadRequestException(
      'The uploaded clip source duration is unavailable.',
    );
  }
  if (sizeBytes > MAX_CLIP_SOURCE_SIZE_BYTES) {
    throw new BadRequestException('Clip sources may be up to 10 GB.');
  }
  if (!/^(audio|video)\//.test(String(ingredient.mimeType))) {
    throw new BadRequestException(
      'The uploaded clip source is not supported audio or video media.',
    );
  }
  if (durationSeconds > CLIPPER_SOURCE_MAX_DURATION_SECONDS) {
    throw new BadRequestException('Clip sources may be up to 6 hours long.');
  }
  return { durationSeconds, sizeBytes };
}

/** True when the file itself was refused (unreadable media or over the cap). */
export function isRejectedUpload(error: unknown): boolean {
  return (
    error instanceof HttpException &&
    (error.getStatus() === HttpStatus.UNPROCESSABLE_ENTITY ||
      error.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE)
  );
}
