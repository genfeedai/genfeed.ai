import type {
  DesktopAssetUploadPolicy,
  IDesktopAsset,
} from '@genfeedai/desktop-contracts';

export function canSyncAssetMetadata(
  asset: Pick<IDesktopAsset, 'origin' | 'uploadPolicy'>,
): boolean {
  return asset.uploadPolicy !== 'never' && asset.origin !== 'cloud-generation';
}

export function canUploadAssetContent(
  uploadPolicy: DesktopAssetUploadPolicy,
  allowFullAssetUploads: boolean,
): boolean {
  return allowFullAssetUploads && uploadPolicy === 'full';
}
