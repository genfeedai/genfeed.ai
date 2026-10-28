import type { VideoStitchEndCard } from '@api/services/video-stitch/video-stitch.types';
import { stitchRequestError } from '@api/services/video-stitch/video-stitch.util';
import {
  BRAND_END_CARD_LIMITS,
  BRAND_END_CARD_MIME_TYPES,
} from '@genfeedai/contracts/constants';
import type { IVideoMergeSettings } from '@genfeedai/contracts/interfaces';
import { AssetCategory } from '@genfeedai/prisma';
import { assertStoredObjectKey } from '@libs/security/stored-object-key';

/** Folder a brand kit asset without a stored key resolves under. */
const END_CARD_ASSET_FOLDERS: Partial<Record<AssetCategory, string>> = {
  [AssetCategory.BANNER]: 'banners',
  [AssetCategory.LOGO]: 'logos',
  [AssetCategory.REFERENCE]: 'references',
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_END_CARD_BACKGROUND = '#000000';

export interface BrandEndCardRow {
  backgroundColor: string;
  endCardAssetId: string | null;
  endCardDurationSeconds: number;
  isEndCardEnabled: boolean;
}

export interface BrandEndCardAssetRow {
  category: AssetCategory;
  cloudObjectKey: string | null;
  id: string;
  mimeType: string | null;
}

/**
 * The brand's setting decides, unless the caller marked this output as not
 * final (`isEndCardEnabled: false`), such as a clip a later stitch joins.
 */
export function isBrandEndCardRequested(
  brand: Pick<BrandEndCardRow, 'endCardAssetId' | 'isEndCardEnabled'> | null,
  settings: IVideoMergeSettings,
): boolean {
  return Boolean(
    brand?.isEndCardEnabled &&
      brand.endCardAssetId &&
      settings.isEndCardEnabled !== false,
  );
}

/**
 * The stored image and on-screen time for a brand that turned the end card
 * on. A configured card that cannot be used fails the stitch instead of
 * shipping the video without the brand's closing frame.
 */
export function resolveVideoStitchEndCard(
  brand: BrandEndCardRow,
  asset: BrandEndCardAssetRow | null,
): VideoStitchEndCard {
  if (!asset || !BRAND_END_CARD_MIME_TYPES.includes(asset.mimeType ?? '')) {
    throw stitchRequestError(
      'endCard',
      'The brand end card must be a PNG, JPEG or WebP image from the brand kit',
      'Brand end card unavailable',
    );
  }
  const folder = END_CARD_ASSET_FOLDERS[asset.category];
  const key = asset.cloudObjectKey ?? (folder ? `${folder}/${asset.id}` : null);
  if (!key) {
    throw stitchRequestError(
      'endCard',
      'The brand end card image has not been uploaded',
      'Brand end card unavailable',
    );
  }
  const { MAX_DURATION_SECONDS, MIN_DURATION_SECONDS } = BRAND_END_CARD_LIMITS;
  const durationSeconds = Math.min(
    MAX_DURATION_SECONDS,
    Math.max(MIN_DURATION_SECONDS, brand.endCardDurationSeconds),
  );
  return {
    backgroundColor: HEX_COLOR.test(brand.backgroundColor)
      ? brand.backgroundColor
      : DEFAULT_END_CARD_BACKGROUND,
    durationSeconds,
    storageKey: assertStoredObjectKey(key, (message) =>
      stitchRequestError('endCard', message, 'Brand end card unavailable'),
    ),
  };
}
