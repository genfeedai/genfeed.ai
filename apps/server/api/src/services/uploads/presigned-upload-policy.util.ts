import { IngredientCategory } from '@genfeedai/contracts';
import {
  ACCEPTED_AUDIO_TYPES,
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_FILE_SIZE,
} from '@genfeedai/contracts/constants';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

const MEGABYTE = 1024 * 1024;

/**
 * Library images also accept HEIC/HEIF declarations (#5850); conversion is
 * tracked separately in #5629, so the server only has to let them through.
 */
const IMAGE_CONTENT_TYPES: readonly string[] = [
  ...ACCEPTED_IMAGE_TYPES,
  'image/heic',
  'image/heif',
];

const VIDEO_CONTENT_TYPES: readonly string[] = [
  ...ACCEPTED_VIDEO_TYPES,
  'video/avi',
  'video/x-matroska',
  'video/x-msvideo',
];

const AUDIO_CONTENT_TYPES: readonly string[] = [
  ...ACCEPTED_AUDIO_TYPES,
  'audio/aac',
  'audio/flac',
  'audio/webm',
  'audio/x-wav',
];

export interface PresignedUploadPolicy {
  readonly allowedContentTypes: readonly string[];
  readonly maxBytes: number;
}

const IMAGE_POLICY: PresignedUploadPolicy = {
  allowedContentTypes: IMAGE_CONTENT_TYPES,
  maxBytes: 50 * MEGABYTE,
};

const VIDEO_POLICY: PresignedUploadPolicy = {
  allowedContentTypes: VIDEO_CONTENT_TYPES,
  maxBytes: MAX_FILE_SIZE,
};

const AUDIO_POLICY: PresignedUploadPolicy = {
  allowedContentTypes: AUDIO_CONTENT_TYPES,
  maxBytes: 50 * MEGABYTE,
};

const POLICY_BY_CATEGORY: Readonly<
  Partial<Record<IngredientCategory, PresignedUploadPolicy>>
> = {
  [IngredientCategory.AUDIO]: AUDIO_POLICY,
  [IngredientCategory.AVATAR]: IMAGE_POLICY,
  [IngredientCategory.GIF]: IMAGE_POLICY,
  [IngredientCategory.IMAGE]: IMAGE_POLICY,
  [IngredientCategory.IMAGE_EDIT]: IMAGE_POLICY,
  [IngredientCategory.MUSIC]: AUDIO_POLICY,
  [IngredientCategory.VIDEO]: VIDEO_POLICY,
  [IngredientCategory.VIDEO_EDIT]: VIDEO_POLICY,
  [IngredientCategory.VOICE]: AUDIO_POLICY,
};

/** Policy for a category, or `undefined` when it cannot be uploaded directly. */
export function resolvePresignedUploadPolicy(
  category: IngredientCategory,
): PresignedUploadPolicy | undefined {
  return POLICY_BY_CATEGORY[category];
}

export function isImageOrVideoCategory(category: IngredientCategory): boolean {
  const policy = resolvePresignedUploadPolicy(category);
  return policy === IMAGE_POLICY || policy === VIDEO_POLICY;
}

export function isAudioCategory(category: IngredientCategory): boolean {
  return resolvePresignedUploadPolicy(category) === AUDIO_POLICY;
}

export function normalizeUploadContentType(contentType: unknown): string {
  return typeof contentType === 'string'
    ? (contentType.split(';')[0]?.trim().toLowerCase() ?? '')
    : '';
}

function resolveMaxBytes(
  policy: PresignedUploadPolicy,
  maxBytesOverride?: number,
): number {
  return maxBytesOverride !== undefined && maxBytesOverride > 0
    ? maxBytesOverride
    : policy.maxBytes;
}

/**
 * Enforces the server-side content-type allowlist and size cap for a direct
 * upload before any grant or ingredient exists. Returns the normalized content
 * type that is signed into the upload URL.
 */
export function assertPresignedUploadAllowed(input: {
  category: IngredientCategory;
  contentType: unknown;
  maxBytesOverride?: number;
  sizeBytes?: number;
}): string {
  const policy = resolvePresignedUploadPolicy(input.category);
  if (!policy) {
    throw new BadRequestException(
      `Category "${String(input.category).toLowerCase()}" does not support direct uploads`,
    );
  }

  const contentType = normalizeUploadContentType(input.contentType);
  if (!policy.allowedContentTypes.includes(contentType)) {
    throw new UnsupportedMediaTypeException(
      `Content type "${contentType || 'unknown'}" is not allowed for ${String(input.category).toLowerCase()} uploads. Allowed types: ${policy.allowedContentTypes.join(', ')}`,
    );
  }

  const maxBytes = resolveMaxBytes(policy, input.maxBytesOverride);
  if (input.sizeBytes !== undefined) {
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
      throw new BadRequestException('sizeBytes must be a positive integer');
    }
    if (input.sizeBytes > maxBytes) {
      throw new PayloadTooLargeException(
        `Upload of ${input.sizeBytes} bytes exceeds the ${maxBytes} byte limit for ${String(input.category).toLowerCase()} uploads`,
      );
    }
  }

  return contentType;
}

/** Cap applied when confirming an upload whose declared size was not signed. */
export function resolveUploadMaxBytes(
  category: IngredientCategory,
  maxBytesOverride?: number,
): number | undefined {
  const policy = resolvePresignedUploadPolicy(category);
  return policy ? resolveMaxBytes(policy, maxBytesOverride) : undefined;
}
