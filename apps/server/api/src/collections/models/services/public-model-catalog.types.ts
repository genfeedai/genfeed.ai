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
