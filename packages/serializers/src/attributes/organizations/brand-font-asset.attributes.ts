import { createEntityAttributes } from '@genfeedai/helpers';
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
    !/^[a-f0-9]{64}$/.test(record.sha256)
  )
    throw new Error('font_asset_unavailable');
  return `sha256:${record.sha256}`;
}
