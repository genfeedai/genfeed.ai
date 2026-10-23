import { projectReviewedCrunModelInputControls } from '@api/collections/models/services/crun-model-contract.util';
import type {
  PublicModelCatalogDocument,
  PublicModelCatalogRow,
} from '@api/collections/models/services/public-model-catalog.types';
import { withLiveModelCreditPricing } from '@genfeedai/pricing';

export function toPublicModelCatalogDocument(
  row: PublicModelCatalogRow,
): PublicModelCatalogDocument {
  const priced = withLiveModelCreditPricing(row);

  return {
    aliases:
      row.providerOffers
        ?.map((offer) => offer.executionModel.key)
        .filter((key) => key !== row.key) ?? [],
    aspectRatios: priced.aspectRatios,
    capabilities: priced.capabilities,
    category: priced.category,
    cost: priced.cost,
    costTier: priced.costTier,
    defaultAspectRatio: priced.defaultAspectRatio,
    defaultDuration: priced.defaultDuration,
    description: priced.description,
    durations: priced.durations,
    id: priced.id,
    inputControls: projectReviewedCrunModelInputControls(row),
    isDefault: priced.isDefault,
    isHighlighted: priced.isHighlighted,
    key: priced.key,
    label: priced.label,
    maxOutputs: priced.maxOutputs,
    provider: priced.provider,
    qualityTier: priced.qualityTier,
    recommendedFor: priced.recommendedFor,
    speedTier: priced.speedTier,
    supportsFeatures: priced.supportsFeatures,
  };
}
