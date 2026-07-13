import type { IDesktopAsset } from '@genfeedai/desktop-contracts';
import { useState } from 'react';
import { hasLocalAssetCopy, resolveDesktopAssetUrl } from '../asset-url.util';

type LibraryAssetPreviewProps = {
  asset: IDesktopAsset;
  signedCloudUrl?: string;
};

export function LibraryAssetPreview({
  asset,
  signedCloudUrl,
}: LibraryAssetPreviewProps) {
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const previewUrl = resolveDesktopAssetUrl(asset, signedCloudUrl);
  const hasLoadError = previewUrl !== null && failedPreviewUrl === previewUrl;

  if (!previewUrl || hasLoadError || asset.kind !== 'image') {
    const message =
      asset.residency === 'missing-local' ||
      (hasLoadError && hasLocalAssetCopy(asset))
        ? 'Local file missing'
        : asset.residency === 'cloud-only'
          ? 'Cloud preview unavailable offline'
          : 'Preview unavailable';

    return (
      <div className="asset-preview asset-preview-unavailable" role="status">
        {message}
      </div>
    );
  }

  return (
    <div className="asset-preview">
      <img
        alt={asset.displayName}
        className="asset-preview-image"
        loading="lazy"
        onError={() => setFailedPreviewUrl(previewUrl)}
        src={previewUrl}
      />
    </div>
  );
}
