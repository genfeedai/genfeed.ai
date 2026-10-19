'use client';

import type { BrandKitAssetGridProps } from '@props/pages/brand-detail.props';
import BrandKitAssetTile from './BrandKitAssetTile';

/**
 * Picture grid for one side of an asset field. A proposed asset that matches a
 * crawled candidate is selectable in place, so the picture the user reviews is
 * the picture they pick.
 */
export default function BrandKitAssetGrid({
  assets,
  candidates = [],
  emptyLabel,
  onToggleCandidate,
  selectedCandidateIds,
  statusLabelByCandidateId,
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
      {assets.map((asset, index) => {
        const candidate = onToggleCandidate
          ? candidates.find(
              (item) => item.role === asset.role && item.url === asset.url,
            )
          : undefined;

        return (
          <BrandKitAssetTile
            key={asset.id ?? asset.url ?? `${asset.role}-${index}`}
            asset={asset}
            isSelectable={Boolean(candidate)}
            isSelected={
              candidate
                ? (selectedCandidateIds?.has(candidate.candidateId) ?? false)
                : false
            }
            statusLabel={
              candidate
                ? statusLabelByCandidateId?.get(candidate.candidateId)
                : undefined
            }
            onToggle={
              candidate && onToggleCandidate
                ? () => onToggleCandidate(candidate.candidateId)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
