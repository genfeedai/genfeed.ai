import type { IDesktopAsset } from '@genfeedai/desktop-contracts';
import { buildDesktopAssetUrl } from '@genfeedai/desktop-contracts';

const LOCAL_ASSET_RESIDENCIES = new Set<IDesktopAsset['residency']>([
  'local-only',
  'synced',
  'upload-pending',
]);

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

export function hasLocalAssetCopy(asset: IDesktopAsset): boolean {
  return LOCAL_ASSET_RESIDENCIES.has(asset.residency);
}

export function resolveDesktopAssetUrl(
  asset: IDesktopAsset,
  signedCloudUrl?: string,
): string | null {
  if (hasLocalAssetCopy(asset)) {
    return buildDesktopAssetUrl(asset.id);
  }

  return signedCloudUrl && isHttpUrl(signedCloudUrl) ? signedCloudUrl : null;
}
