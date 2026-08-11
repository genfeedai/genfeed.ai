'use client';

import type { BrandKitAssetGridProps } from '@props/pages/brand-detail.props';
import BrandKitAssetTile from './BrandKitAssetTile';

/** Read-only picture grid for the current/proposed side of an asset field. */
export default function BrandKitAssetGrid({
  assets,
  emptyLabel,
}: BrandKitAssetGridProps) {
  if (assets.length === 0) {
    return (
      <div className="min-h-12 rounded-md bg-background-secondary p-2 text-xs text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {assets.map((asset, index) => (
        <BrandKitAssetTile
          key={asset.id ?? asset.url ?? `${asset.role}-${index}`}
          asset={asset}
        />
      ))}
    </div>
  );
}
