import type { IDesktopAsset } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { HiOutlineFolderOpen } from 'react-icons/hi2';

type LibraryAssetGridProps = {
  assets: IDesktopAsset[];
  onRevealAsset: (assetId: string) => void;
};

export function LibraryAssetGrid({
  assets,
  onRevealAsset,
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
            {asset.localPath && (
              <Button
                ariaLabel={`Show ${asset.displayName} in Finder`}
                className="asset-card-action"
                onClick={() => onRevealAsset(asset.id)}
                type="button"
                variant={ButtonVariant.GHOST}
              >
                <HiOutlineFolderOpen className="nav-icon-svg" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
