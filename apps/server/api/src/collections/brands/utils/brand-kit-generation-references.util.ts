import { ReferenceImageCategory } from '@genfeedai/contracts';
import type {
  IBrandKitResolvedAsset,
  IBrandKitResolvedAssets,
} from '@genfeedai/contracts/interfaces';

type ReferenceCategory = ReferenceImageCategory;

/** A brand reference and the one role it plays; fits image and video briefs. */
export interface BrandGenerationReference {
  assetId: string;
  description?: string;
  role: 'character' | 'product' | 'style';
}

export interface BrandGenerationReferenceOptions {
  /** Assets the caller already attached; never repeated as a default. */
  excludeAssetIds?: readonly string[];
  /** A person's likeness is added only when the caller opted in. */
  includeFaces?: boolean;
  /** Most defaults returned, so the caller can respect the model's limit. */
  limit?: number;
}

/** Style references lead, then product; a face only follows when opted in. */
const DEFAULT_CATEGORY_ORDER: readonly ReferenceCategory[] = [
  ReferenceImageCategory.STYLE,
  ReferenceImageCategory.PRODUCT,
  ReferenceImageCategory.FACE,
];

function generationRoleForCategory(
  category?: ReferenceCategory,
): BrandGenerationReference['role'] {
  switch (category) {
    case ReferenceImageCategory.FACE:
      return 'character';
    case ReferenceImageCategory.PRODUCT:
      return 'product';
    default:
      return 'style';
  }
}

/** Rows saved by legacy clients carry no category and count as style. */
function categoryOf(asset: IBrandKitResolvedAsset): ReferenceCategory {
  return asset.referenceCategory ?? ReferenceImageCategory.STYLE;
}

/**
 * The brand's own references as a stable run reference set, and the one rule
 * every surface applies when the caller attached nothing: style references
 * first, then product; a face only on opt-in; a logo never, because it is a
 * mark to place, not a look to follow. Display names never take part in role
 * resolution.
 */
export function toBrandGenerationReferences(
  brandKit: IBrandKitResolvedAssets,
  options: BrandGenerationReferenceOptions = {},
): readonly BrandGenerationReference[] {
  const excluded = new Set(options.excludeAssetIds ?? []);
  const allowed = DEFAULT_CATEGORY_ORDER.filter(
    (category) =>
      category !== ReferenceImageCategory.FACE || options.includeFaces === true,
  );
  const limit = Math.max(0, options.limit ?? Number.POSITIVE_INFINITY);
  const selected = allowed
    .flatMap((category) =>
      brandKit.references.filter((asset) => categoryOf(asset) === category),
    )
    .filter((asset) => !excluded.has(asset.id))
    .slice(0, limit);

  return Object.freeze(
    selected.map((asset) =>
      Object.freeze({
        assetId: asset.id,
        ...(asset.label ? { description: asset.label } : {}),
        role: generationRoleForCategory(asset.referenceCategory),
      }),
    ),
  );
}
