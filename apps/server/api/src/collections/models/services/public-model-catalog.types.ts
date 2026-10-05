import type { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import type { CrunInputControls } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

export const PUBLIC_MODEL_CATALOG_SELECT = {
  aspectRatios: true,
  capabilities: true,
  category: true,
  cost: true,
  costPerUnit: true,
  costTier: true,
  defaultAspectRatio: true,
  defaultDuration: true,
  description: true,
  durations: true,
  id: true,
  isDefault: true,
  isHighlighted: true,
  key: true,
  label: true,
  maxOutputs: true,
  minCost: true,
  pricingType: true,
  provider: true,
  providerCostUsd: true,
  providerInputSchema: true,
  reviewedProviderContractVersion: true,
  qualityTier: true,
  recommendedFor: true,
  speedTier: true,
  supportsFeatures: true,
} satisfies Prisma.ModelSelect;

/**
 * Private pricing inputs the red-model classification reads. Selected by a
 * separate query so none of it can reach the anonymous catalog projection.
 */
export const PRICING_ATTENTION_SELECT = {
  category: true,
  cost: true,
  costPerUnit: true,
  defaultDuration: true,
  endpoint: true,
  hasAudioToggle: true,
  hasResolutionOptions: true,
  id: true,
  inputCostPerMillionTokens: true,
  isActive: true,
  isDeleted: true,
  isFree: true,
  key: true,
  minCost: true,
  outputCostPerMillionTokens: true,
  pendingProviderContractVersion: true,
  pricingType: true,
  provider: true,
  providerContracts: {
    select: {
      conditionalDimensions: true,
      discoveredAt: true,
      endpoint: true,
      lastSeenAt: true,
      mappingStatus: true,
      pricing: true,
      provider: true,
      reviewStatus: true,
      version: true,
    },
  },
  providerCostUsd: true,
  providerInputSchema: true,
  providerPricingSyncedAt: true,
  providerSyncFailureCode: true,
  providerSyncStatus: true,
  reviewedProviderContractVersion: true,
} satisfies Prisma.ModelSelect;

export type PublicModelCatalogRow = Prisma.ModelGetPayload<{
  select: typeof PUBLIC_MODEL_CATALOG_SELECT;
}>;

export type PublicModelCatalogDocument = Pick<
  PublicModelCatalogRow,
  | 'aspectRatios'
  | 'capabilities'
  | 'category'
  | 'costTier'
  | 'defaultAspectRatio'
  | 'defaultDuration'
  | 'description'
  | 'durations'
  | 'id'
  | 'isDefault'
  | 'isHighlighted'
  | 'key'
  | 'label'
  | 'maxOutputs'
  | 'provider'
  | 'qualityTier'
  | 'recommendedFor'
  | 'speedTier'
  | 'supportsFeatures'
> & { cost: number; inputControls?: CrunInputControls };

export type PublicModelCatalogFilters = {
  category?: ModelCategory;
  provider?: ModelProvider;
};
