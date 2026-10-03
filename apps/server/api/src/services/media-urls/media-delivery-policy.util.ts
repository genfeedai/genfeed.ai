import { createHash } from 'node:crypto';
import type {
  MediaDeliveryScope,
  MediaDeliverySource,
} from '@genfeedai/contracts/interfaces';
import { ForbiddenException } from '@nestjs/common';

export const MEDIA_DELIVERY_POLICY_VERSION = 1;
export const PLATFORM_PREVIEW_LAYERS = [
  { text: 'Genfeed.ai', position: 'bottom-right', opacity: 0.85 },
] as const;

export const MEDIA_DELIVERY_SOURCE_SELECT = {
  brandId: true,
  category: true,
  fileSize: true,
  generationCompletedAt: true,
  id: true,
  isPublic: true,
  metadataId: true,
  mimeType: true,
  organizationId: true,
  s3Key: true,
  scope: true,
  userId: true,
  version: true,
} as const;

export function mediaSourceIdentity(source: MediaDeliverySource): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        source.s3Key,
        source.version,
        source.generationCompletedAt?.toISOString() ?? null,
        source.fileSize,
        source.mimeType,
      ]),
    )
    .digest('hex');
}

export function requireStoredMediaKey(
  source: Pick<MediaDeliverySource, 's3Key'>,
): string {
  if (!source.s3Key || /^https?:\/\//i.test(source.s3Key)) {
    throw new ForbiddenException('Media has no trusted storage identity');
  }
  // Return the original bytes: escaped sequences in a raw key are not decoded.
  const key = source.s3Key;
  if (
    key.startsWith('/') ||
    key.includes('\\') ||
    [...key].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    key
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new ForbiddenException('Media has an invalid storage identity');
  }
  return key;
}

export function hasMediaRecordAccess(
  source: MediaDeliverySource,
  scope: MediaDeliveryScope,
): boolean {
  if (source.organizationId !== scope.organizationId) return false;
  if (source.userId === scope.userId) return true;
  switch (source.scope) {
    case 'ORGANIZATION':
    case 'PUBLIC':
      return true;
    case 'BRAND':
      return Boolean(scope.brandId && source.brandId === scope.brandId);
    default:
      return false;
  }
}

export function protectedPreviewCategory(
  source: MediaDeliverySource,
): 'images' | 'videos' | null {
  if (['IMAGE', 'IMAGE_EDIT'].includes(source.category)) return 'images';
  if (['VIDEO', 'VIDEO_EDIT'].includes(source.category)) return 'videos';
  return null;
}
