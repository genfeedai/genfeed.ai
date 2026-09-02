import { PRISMA_ASSET_CATEGORY_BY_ROLE } from '@api/collections/brands/constants/brand-kit-assets.constant';
import type {
  IBrandKitAssetRelation,
  IBrandKitAssetRelations,
  IBrandKitResolvedAsset,
  IBrandKitResolvedAssets,
} from '@genfeedai/contracts/interfaces';

function toAssetRelation(
  asset: IBrandKitResolvedAsset,
): IBrandKitAssetRelation {
  return {
    category: String(PRISMA_ASSET_CATEGORY_BY_ROLE[asset.role]),
    cdnUrl: asset.url,
    displayName: asset.label,
    id: asset.id,
    mimeType: asset.mimeType,
    ...(asset.referenceCategory
      ? { referenceCategory: asset.referenceCategory }
      : {}),
  };
}

/**
 * Reshape a resolved brand kit into the brand serializer's asset relations.
 *
 * `resolveBrandKitAssets` answers the question agents and generation nodes ask
 * ("give me a URL for this role"). The serializer asks a different one, in
 * `assetAttributes` terms. Mapping here keeps the resolver's contract — and its
 * tests — untouched instead of widening its select to serve a second consumer.
 */
export function toBrandKitAssetRelations(
  resolved: IBrandKitResolvedAssets,
): IBrandKitAssetRelations {
  return {
    banner: resolved.banner ? toAssetRelation(resolved.banner) : undefined,
    logo: resolved.logo ? toAssetRelation(resolved.logo) : undefined,
    references: resolved.references.map(toAssetRelation),
  };
}
