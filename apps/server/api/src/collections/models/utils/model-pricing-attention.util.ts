import { PRICING_ATTENTION_SELECT } from '@api/collections/models/services/public-model-catalog.types';
import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ModelBillablePricingProfile,
  ModelPricingAttention,
} from '@genfeedai/contracts/interfaces';
import {
  classifyModelPricingAttention,
  getRuntimeMarginMultiplier,
  isModelPricingRed,
} from '@genfeedai/pricing';
import type { Model, ModelProviderContract, Prisma } from '@genfeedai/prisma';
import { platformOrTenantScope } from '@libs/prisma/platform-scope';

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
      (model.inputCostPerMillionTokens ?? 0) > 0 ||
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

/**
 * Ids of the rows matching `where` that the red classification marks
 * unpriceable. The caller supplies a `where` that proves its organization to
 * the CLOUD tenant guard (see `unpriceableModelsScope`).
 */
export async function findUnpriceableModelIds(
  prisma: PrismaService,
  where: Prisma.ModelWhereInput,
): Promise<string[]> {
  // tenant-scope-ignore: callers pass a platform-only or platform-plus-tenant `where` (organizationId:null or the platform-or-tenant arm) with isDeleted:false
  const rows = await prisma.model.findMany({
    select: PRICING_ATTENTION_SELECT,
    where,
  });
  const now = new Date();
  const margin = getRuntimeMarginMultiplier();
  return rows
    .filter((row) =>
      isModelRowPricingRed(row, row.providerContracts, margin, now),
    )
    .map((row) => row.id);
}

/** Exactly the rows a caller's `/models` list can return: platform plus own. */
export function unpriceableModelsScope(
  organizationId?: string,
): Prisma.ModelWhereInput {
  return { isDeleted: false, ...platformOrTenantScope(organizationId) };
}

/** `where` narrowed to rows that are not unpriceable (red). */
export async function withoutUnpriceableModels(
  prisma: PrismaService,
  where: Prisma.ModelWhereInput,
): Promise<Prisma.ModelWhereInput> {
  const ids = await findUnpriceableModelIds(prisma, where);
  return ids.length ? { ...where, id: { notIn: ids } } : where;
}
