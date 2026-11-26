import {
  type BrandGenerationReference,
  toBrandGenerationReferences,
} from '@api/collections/brands/utils/brand-kit-generation-references.util';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/contracts/constants';
import type {
  IBrandDefaultReferences,
  IBrandKitResolvedAssets,
} from '@genfeedai/contracts/interfaces';

export interface BrandDefaultReferenceReceipt {
  /** Brand reference assets attached because the caller attached none. */
  attachedAssetIds: readonly string[];
  /** The same assets with the role each one plays in the brief. */
  references: readonly BrandGenerationReference[];
  /** Why the brand had references and none were attached. */
  skippedReason?: 'model_accepts_no_references';
}

/** Most reference images a model accepts; a model the catalog lacks takes none. */
function maxReferencesForModel(modelKey: string): number {
  const capability = MODEL_OUTPUT_CAPABILITIES[modelKey];
  return capability && capability.maxReferences > 0
    ? capability.maxReferences
    : 0;
}

/**
 * The one rule behind brand reference defaults on Studio, agent and MCP: when
 * branding is on and the caller attached nothing, the brand's style then
 * product references fill the model's reference slots. A caller who attached
 * anything chose the look, so nothing is added, and `brandingMode: 'off'` means
 * raw.
 */
export function resolveBrandDefaultReferences(params: {
  brandKit: IBrandKitResolvedAssets;
  brandingMode?: 'off' | 'brand';
  explicitReferenceIds: readonly string[];
  modelKey: string;
}): BrandDefaultReferenceReceipt {
  if (params.brandingMode === 'off' || params.explicitReferenceIds.length > 0) {
    return { attachedAssetIds: [], references: [] };
  }
  const limit = maxReferencesForModel(params.modelKey);
  const candidates = toBrandGenerationReferences(params.brandKit);
  if (candidates.length > 0 && limit === 0) {
    return {
      attachedAssetIds: [],
      references: [],
      skippedReason: 'model_accepts_no_references',
    };
  }
  const references = toBrandGenerationReferences(params.brandKit, { limit });
  return {
    attachedAssetIds: references.map((reference) => reference.assetId),
    references,
  };
}

/**
 * What Studio shows before a generation: the references the rule above would
 * attach for this model, with the preview each one needs.
 */
export function previewBrandDefaultReferences(params: {
  brandKit: IBrandKitResolvedAssets;
  modelKey: string;
}): IBrandDefaultReferences {
  const defaults = resolveBrandDefaultReferences({
    brandKit: params.brandKit,
    brandingMode: 'brand',
    explicitReferenceIds: [],
    modelKey: params.modelKey,
  });
  const assetById = new Map(
    params.brandKit.references.map((asset) => [asset.id, asset]),
  );
  return {
    references: defaults.references.flatMap((reference) => {
      const asset = assetById.get(reference.assetId);
      return asset
        ? [
            {
              assetId: reference.assetId,
              ...(reference.description
                ? { label: reference.description }
                : {}),
              role: reference.role,
              url: asset.url,
            },
          ]
        : [];
    }),
    ...(defaults.skippedReason
      ? { skippedReason: defaults.skippedReason }
      : {}),
  };
}
