import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { projectReviewedCrunModelInputControls } from '@api/collections/models/services/crun-model-contract.util';
import { PRICING_ATTENTION_SELECT } from '@api/collections/models/services/public-model-catalog.types';
import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import { classifyModelRowPricingAttention } from '@api/collections/models/utils/model-pricing-attention.util';
import {
  getRuntimeMarginMultiplier,
  MODEL_PRICING_REFRESH_STALE_DAYS,
  withLiveModelCreditPricing,
} from '@genfeedai/pricing';
import type { Prisma, Model as PrismaModel } from '@genfeedai/prisma';
import { isRecord } from '@genfeedai/utils/data/extract.util';

export type ModelWithPricingContracts = PrismaModel &
  Partial<
    Pick<
      Prisma.ModelGetPayload<{
        include: {
          providerContracts: typeof PRICING_ATTENTION_SELECT.providerContracts;
        };
      }>,
      'providerContracts'
    >
  >;

export function hasReviewedModelPricing(
  document: ModelWithPricingContracts,
  now = new Date(),
): boolean {
  if (
    document.pricingType !== 'conditional' ||
    document.isDeleted ||
    document.reviewStatus !== 'approved' ||
    document.providerSyncStatus !== 'fresh'
  )
    return false;
  const syncedAt = Date.parse(String(document.providerPricingSyncedAt));
  if (
    !Number.isFinite(syncedAt) ||
    syncedAt > now.getTime() ||
    now.getTime() - syncedAt > MODEL_PRICING_REFRESH_STALE_DAYS * 86_400_000
  )
    return false;
  // Availability describes reviewed terms, including an inactive row an
  // operator may promote. Lifecycle and activation remain separate gates.
  const candidate = { ...document, isActive: true };
  const contracts = document.providerContracts ?? [];
  const profile = projectModelBillablePricingProfile(candidate, contracts);
  return Boolean(
    profile.reviewedPricing?.rates.length &&
      profile.reviewedPricing.rates.every(
        (rate) => Number.isFinite(rate.unitPriceUsd) && rate.unitPriceUsd > 0,
      ) &&
      !classifyModelRowPricingAttention(
        candidate,
        contracts,
        getRuntimeMarginMultiplier(),
        now,
        profile,
      ).some((flag) => flag.level === 'red'),
  );
}

export function getModelProviderConfig(
  document: unknown,
): Record<string, unknown> {
  if (!isRecord(document)) {
    return {};
  }

  if (isRecord(document.config)) {
    return document.config;
  }
  return isRecord(document.providerConfig) ? document.providerConfig : {};
}

export function projectRegistryModelDocument(
  document: ModelWithPricingContracts,
): ModelDocument {
  const { config: _config, ...model } = document;
  // Virtual cost / costPerUnit / minCost: when providerCostUsd is present,
  // project live credits via applyMargin (admin marginMultiplier). DB still
  // stores providerCostUsd + optional baked fallbacks; UI/API always see
  // margin-current values on read.
  const withProviderConfig = {
    ...model,
    providerConfig: getModelProviderConfig(document),
    inputControls: projectReviewedCrunModelInputControls(document),
    hasReviewedPricing: hasReviewedModelPricing(document),
  };
  return withLiveModelCreditPricing(
    withProviderConfig,
  ) as unknown as ModelDocument;
}
