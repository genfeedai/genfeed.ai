import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import type {
  ModelBillablePricingProfile,
  ModelPricingAttention,
} from '@genfeedai/contracts/interfaces';
import {
  classifyModelPricingAttention,
  isModelPricingRed,
} from '@genfeedai/pricing';
import type { Model, ModelProviderContract } from '@genfeedai/prisma';

export type PricingAttentionModel = Pick<
  Model,
  | 'category'
  | 'cost'
  | 'costPerUnit'
  | 'defaultDuration'
  | 'endpoint'
  | 'hasAudioToggle'
  | 'hasResolutionOptions'
  | 'inputCostPerMillionTokens'
  | 'isActive'
  | 'isDeleted'
  | 'isFree'
  | 'key'
  | 'minCost'
  | 'outputCostPerMillionTokens'
  | 'pendingProviderContractVersion'
  | 'pricingType'
  | 'providerCostUsd'
  | 'providerInputSchema'
  | 'providerPricingSyncedAt'
  | 'providerSyncFailureCode'
  | 'providerSyncStatus'
  | 'provider'
  | 'reviewedProviderContractVersion'
>;
export type PricingAttentionContract = Pick<
  ModelProviderContract,
  | 'conditionalDimensions'
  | 'discoveredAt'
  | 'endpoint'
  | 'lastSeenAt'
  | 'mappingStatus'
  | 'pricing'
  | 'provider'
  | 'reviewStatus'
  | 'version'
>;

/**
 * What an operator has to act on for one registry row. The admin pricing page
 * and the public catalog filter share this, so a model the panel shows red is
 * exactly a model customers are not offered.
 */
export function classifyModelRowPricingAttention(
  model: PricingAttentionModel,
  contracts: PricingAttentionContract[],
  margin: number | null,
  now: Date,
  profile: ModelBillablePricingProfile = projectModelBillablePricingProfile(
    model,
    contracts,
  ),
): ModelPricingAttention[] {
  return classifyModelPricingAttention({
    category: model.category,
    defaultDuration: model.defaultDuration,
    hasTokenPricing:
      (model.inputCostPerMillionTokens ?? 0) > 0 &&
      (model.outputCostPerMillionTokens ?? 0) > 0,
    isActive: model.isActive,
    isFree: model.isFree,
    margin,
    now,
    profile,
    provider: model.provider,
    providerPricingSyncedAt: model.providerPricingSyncedAt,
    providerSyncFailureCode: model.providerSyncFailureCode,
    providerSyncStatus: model.providerSyncStatus,
  });
}

/** Red models cannot be priced, so customer-facing catalogs leave them out. */
export function isModelRowPricingRed(
  model: PricingAttentionModel,
  contracts: PricingAttentionContract[],
  margin: number | null,
  now: Date,
): boolean {
  return isModelPricingRed(
    classifyModelRowPricingAttention(model, contracts, margin, now),
  );
}
