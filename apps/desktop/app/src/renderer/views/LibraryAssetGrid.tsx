import type { IDesktopAsset } from '@genfeedai/desktop-contracts';
import type { ReactElement } from 'react';

type LibraryAssetGridProps = {
  assets: IDesktopAsset[];
};

export function LibraryAssetGrid({
  assets,
}: LibraryAssetGridProps): ReactElement | null {
  if (assets.length === 0) return null;

  return (
    <div className="ingredient-grid">
      {assets.map((asset) => (
        <div className="ingredient-card panel-card" key={asset.id}>
          <div className="ingredient-header">
            <strong className="ingredient-title">{asset.displayName}</strong>
            <span className="platform-badge">{asset.residency}</span>
          </div>
          <p className="ingredient-content">
            {asset.kind} · {asset.origin} · {asset.mimeType}
          </p>
          <div className="ingredient-footer">
            <span className="vote-count">
              {Math.round(asset.sizeBytes / 1024)} KB
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
