import type { GenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { IBrandKitResolvedAssets } from '@genfeedai/contracts/interfaces';

function generationRoleForCategory(
  category?: 'FACE' | 'PRODUCT' | 'STYLE' | 'LOGO',
): GenerationBriefReference['role'] {
  switch (category) {
    case 'FACE':
      return 'character';
    case 'PRODUCT':
      return 'product';
    default:
      return 'style';
  }
}

/**
 * Convert persisted brand reference categories into a stable run reference
 * set. Missing categories are treated as STYLE for rows created by legacy
 * clients; display names never participate in role resolution.
 */
export function toBrandGenerationReferences(
  brandKit: IBrandKitResolvedAssets,
): readonly GenerationBriefReference[] {
  return Object.freeze(
    brandKit.references.map((asset) =>
      Object.freeze({
        assetId: asset.id,
        ...(asset.label ? { description: asset.label } : {}),
        role: generationRoleForCategory(asset.referenceCategory),
      }),
    ),
  );
}
