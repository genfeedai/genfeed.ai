import { createEntityAttributes } from '@genfeedai/helpers';

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export const brandFontAssetAttributes = createEntityAttributes([
  'brandId',
  'category',
  'mimeType',
  'contentHash',
  'sizeBytes',
  'displayName',
  'originalFileName',
  'createdAt',
  'updatedAt',
  'isDeleted',
]);
export function fontAssetBrandId(record: Record<string, unknown>): string {
  if (typeof record.parentBrandId !== 'string' || !record.parentBrandId)
    throw new Error('font_asset_unavailable');
  return record.parentBrandId;
}
export function fontAssetContentHash(record: Record<string, unknown>): string {
  if (
    typeof record.sha256 !== 'string' ||
    !SHA256_HEX_PATTERN.test(record.sha256)
  )
    throw new Error('font_asset_unavailable');
  return `sha256:${record.sha256}`;
}
