import {
  parseContractReviewedPricing,
  projectModelBillablePricingProfile,
} from '@api/collections/models/utils/model-billable-pricing-profile.util';
import { classifyModelRowPricingAttention } from '@api/collections/models/utils/model-pricing-attention.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  AdminModelPricingReport,
  AdminModelPricingRow,
  ModelPricingEvidence,
} from '@genfeedai/contracts/interfaces';
import {
  describeProviderRateChanges,
  enumerateReviewedVariantSelectors,
  hashReviewedProviderRates,
  hasPendingProviderRateDrift,
  quoteModelBillablePricing,
} from '@genfeedai/pricing';
import {
  type Model,
  type ModelProviderContract,
  Prisma,
} from '@genfeedai/prisma';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { BadRequestException, Injectable } from '@nestjs/common';

const pricingContractSelect = {
  provider: true,
  endpoint: true,
  discoveredAt: true,
  version: true,
  reviewStatus: true,
  currency: true,
  billingUnit: true,
  unitPrice: true,
  conditionalDimensions: true,
  mappingStatus: true,
  lastSeenAt: true,
  pricing: true,
} satisfies Prisma.ModelProviderContractSelect;
const pricingModelSelect = {
  endpoint: true,
  isDeleted: true,
  id: true,
  key: true,
  provider: true,
  category: true,
  isActive: true,
  isFree: true,
  lifecycle: true,
  pricingType: true,
  cost: true,
  costPerUnit: true,
  minCost: true,
  providerCostUsd: true,
  inputCostPerMillionTokens: true,
  outputCostPerMillionTokens: true,
  defaultDuration: true,
  durations: true,
  minDimensions: true,
  maxDimensions: true,
  maxOutputs: true,
  maxReferences: true,
  isBatchSupported: true,
  hasAudioToggle: true,
  hasResolutionOptions: true,
  reviewedProviderContractVersion: true,
  pendingProviderContractVersion: true,
  providerInputSchema: true,
  providerSyncStatus: true,
  providerSyncFailureCode: true,
  providerPricingSyncedAt: true,
  providerContracts: { select: pricingContractSelect },
} satisfies Prisma.ModelSelect;
type PricingModel = Pick<
  Model,
  | 'endpoint'
  | 'isDeleted'
  | 'id'
  | 'key'
  | 'provider'
  | 'category'
  | 'isActive'
  | 'isFree'
  | 'lifecycle'
  | 'pricingType'
  | 'cost'
  | 'costPerUnit'
  | 'minCost'
  | 'providerCostUsd'
  | 'inputCostPerMillionTokens'
  | 'outputCostPerMillionTokens'
  | 'defaultDuration'
  | 'durations'
  | 'minDimensions'
  | 'maxDimensions'
  | 'maxOutputs'
  | 'maxReferences'
  | 'isBatchSupported'
  | 'hasAudioToggle'
  | 'hasResolutionOptions'
  | 'reviewedProviderContractVersion'
  | 'pendingProviderContractVersion'
  | 'providerInputSchema'
  | 'providerSyncStatus'
  | 'providerSyncFailureCode'
  | 'providerPricingSyncedAt'
>;
type PricingContract = Pick<
  ModelProviderContract,
  | 'provider'
  | 'endpoint'
  | 'discoveredAt'
  | 'version'
  | 'reviewStatus'
  | 'currency'
  | 'billingUnit'
  | 'unitPrice'
  | 'conditionalDimensions'
  | 'mappingStatus'
  | 'lastSeenAt'
  | 'pricing'
>;

const NO_PROVIDER_RATE_ACTION =
  'No pending provider rates differ from the approved ones';

function evidence(
  contract: PricingContract | undefined,
): ModelPricingEvidence | null {
  if (!contract) return null;
  const pricing = Array.isArray(contract.pricing)
    ? readRecord(contract.pricing[0])
    : readRecord(contract.pricing);
  return {
    source: typeof pricing.source === 'string' ? pricing.source : null,
    sourceUrl: typeof pricing.sourceUrl === 'string' ? pricing.sourceUrl : null,
    verifiedAt:
      typeof pricing.verifiedAt === 'string' ? pricing.verifiedAt : null,
    rates: null,
    version: contract.version,
    reviewStatus: contract.reviewStatus,
    currency: contract.currency,
    billingUnit: contract.billingUnit,
    unitPrice: contract.unitPrice,
    conditionalDimensions: readRecord(contract.conditionalDimensions),
    mappingStatus: contract.mappingStatus,
    observedAt: contract.lastSeenAt.toISOString(),
  };
}

function priceTypeForUnit(unit: string | null): string | null {
  switch (unit?.toLowerCase().replaceAll(/[- ]/g, '_')) {
    case 'image':
      return 'flat';
    case 'request':
      return 'per-request';
    case 'second':
    case 'video_second':
    case 'second_of_video':
      return 'per-second';
    case 'megapixel':
      return 'per-megapixel';
    default:
      return null;
  }
}

export function projectAdminModelPricing(
  model: PricingModel,
  contracts: PricingContract[],
  margin: number | null,
  retrievedAt: string,
): AdminModelPricingRow {
  const reviewed = evidence(
    contracts.find((c) => c.version === model.reviewedProviderContractVersion),
  );
  const pending = evidence(
    contracts.find((c) => c.version === model.pendingProviderContractVersion),
  );
  const profile = projectModelBillablePricingProfile(model, contracts);
  if (reviewed && profile.reviewedPricing) {
    if (model.provider === 'fal') reviewed.source = 'fal-pricing-api';
    reviewed.rates = profile.reviewedPricing.rates;
    reviewed.sourceUrl = profile.reviewedPricing.sourceUrl;
    reviewed.verifiedAt = profile.reviewedPricing.verifiedAt;
  }
  const reasons: string[] = [];
  // Rate-based evidence (a rate sheet, a Replicate billing page, a Fal price)
  // prices every declared variant itself; the scalar configured-row checks
  // below only describe legacy single-rate evidence.
  const hasReviewedRates = profile.reviewedPricing !== null;
  const hasPolicy =
    typeof margin === 'number' && Number.isFinite(margin) && margin > 0;
  const rate = model.providerCostUsd;
  const hasRate =
    typeof rate === 'number' &&
    Number.isFinite(rate) &&
    (rate > 0 || (rate === 0 && model.isFree));
  if (!hasPolicy) reasons.push('Configured conversion policy unavailable');
  if (!hasRate && !hasReviewedRates)
    reasons.push(
      'Configured provider USD unavailable; stored credits do not verify provider cost',
    );
  if (reviewed?.reviewStatus !== 'approved')
    reasons.push('No approved provider pricing evidence');
  if (
    reviewed &&
    !hasReviewedRates &&
    Object.keys(reviewed.conditionalDimensions).length > 0
  )
    reasons.push('Conditional provider rates require variant reconciliation');
  if (
    reviewed &&
    !hasReviewedRates &&
    (reviewed.currency !== 'USD' || !priceTypeForUnit(reviewed.billingUnit))
  )
    reasons.push('Provider currency or billed unit unsupported');
  if (reviewed && !hasReviewedRates) {
    const price =
      reviewed.unitPrice === null || reviewed.unitPrice.trim() === ''
        ? NaN
        : Number(reviewed.unitPrice);
    if (!Number.isFinite(price) || price < 0 || (price === 0 && !model.isFree))
      reasons.push('Reviewed provider rate is missing or invalid');
    if (reviewed.mappingStatus !== 'supported')
      reasons.push('Provider pricing mapping is not supported');
    const verifiedAt = Date.parse(reviewed.verifiedAt ?? '');
    const age = Date.parse(retrievedAt) - verifiedAt;
    // Rates are refreshed, never expired: only a missing or future date fails.
    if (
      !reviewed.sourceUrl?.startsWith('https://') ||
      reviewed.source === 'curated-known-cost' ||
      reviewed.source === 'reviewed-registry' ||
      !Number.isFinite(verifiedAt) ||
      age < 0
    )
      reasons.push(
        'Official provider rate source/verification date unavailable; observation is not verification',
      );
  }
  const pendingContract = contracts.find(
    (c) => c.version === model.pendingProviderContractVersion,
  );
  const pendingPricing = profile.reviewedPricing
    ? parseContractReviewedPricing(model, pendingContract)
    : null;
  const hasRateDrift = hasPendingProviderRateDrift(
    profile.reviewedPricing
      ? hashReviewedProviderRates(profile.reviewedPricing.rates)
      : null,
    pendingPricing ? hashReviewedProviderRates(pendingPricing.rates) : null,
  );
  const pendingRateChanges =
    hasRateDrift && profile.reviewedPricing && pendingPricing
      ? describeProviderRateChanges(
          profile.reviewedPricing.rates,
          pendingPricing.rates,
        )
      : [];
  if (hasRateDrift)
    reasons.push(
      'The provider changed its price; the approved rate keeps charging until approved',
    );
  if (model.category === 'text')
    reasons.push(
      'Text uses actual answering-model token/usage settlement; catalog sample is not a token quote',
    );
  const identity = { modelKey: model.key, provider: model.provider };
  // A variant model is quoted at its first declared variant; the attention
  // classification below proves every variant prices.
  const firstVariant = profile.reviewedPricing
    ? enumerateReviewedVariantSelectors(profile.reviewedPricing.rates)[0]
    : undefined;
  const variantSelectors =
    firstVariant && Object.keys(firstVariant).length
      ? { selectors: firstVariant }
      : {};
  const unitQuote = quoteModelBillablePricing(
    profile,
    {
      ...identity,
      ...variantSelectors,
      duration: 1,
      width: 1000,
      height: 1000,
    },
    margin,
    retrievedAt,
  );
  const sampleQuote = quoteModelBillablePricing(
    profile,
    {
      ...identity,
      ...variantSelectors,
      ...(model.defaultDuration !== null
        ? { duration: model.defaultDuration }
        : {}),
    },
    margin,
    retrievedAt,
  );
  if (unitQuote.status === 'unresolved' && !hasReviewedRates)
    reasons.push(unitQuote.reason);
  const attention = classifyModelRowPricingAttention(
    model,
    contracts,
    margin,
    new Date(retrievedAt),
    profile,
  );
  if (hasReviewedRates)
    for (const item of attention)
      if (!reasons.includes(item.reason)) reasons.push(item.reason);
  const hasMismatch =
    !!reviewed &&
    !hasReviewedRates &&
    reviewed.unitPrice !== null &&
    reviewed.unitPrice.trim() !== '' &&
    Number.isFinite(Number(reviewed.unitPrice)) &&
    priceTypeForUnit(reviewed.billingUnit) !== null &&
    hasRate &&
    (Number(reviewed.unitPrice) !== rate ||
      priceTypeForUnit(reviewed.billingUnit) !== (model.pricingType || 'flat'));
  if (hasMismatch)
    reasons.push('Approved provider rate/unit differs from configured row');
  if (model.cost === 0 && !model.isFree && !hasRate && !hasReviewedRates)
    reasons.push(
      'Zero stored credits are unresolved, not an explicit free model',
    );
  const schema = readRecord(model.providerInputSchema);
  const properties = readRecord(schema.properties);
  const selectors = Object.fromEntries(
    [
      'resolution',
      'quality',
      'mode',
      'generate_audio',
      'fps',
      'num_frames',
      'num_outputs',
    ].flatMap((key) => {
      const property = readRecord(properties[key]);
      return Object.keys(property).length
        ? [
            [
              key,
              {
                enum: property.enum ?? null,
                default: property.default ?? null,
                minimum: property.minimum ?? null,
                maximum: property.maximum ?? null,
              },
            ],
          ]
        : [];
    }),
  );
  return {
    id: model.id,
    key: model.key,
    provider: model.provider,
    category: model.category,
    isActive: model.isActive,
    isFree: model.isFree,
    lifecycle: model.lifecycle,
    pricingType: model.pricingType,
    configuredCost: model.cost,
    configuredCostPerUnit: model.costPerUnit,
    configuredMinCost: model.minCost,
    configuredProviderCostUsd: model.providerCostUsd,
    inputCostPerMillionTokens: model.inputCostPerMillionTokens,
    outputCostPerMillionTokens: model.outputCostPerMillionTokens,
    effectiveUnitCredits:
      unitQuote.status === 'priced' ? unitQuote.snapshot.credits : null,
    effectiveSampleCredits:
      sampleQuote.status === 'priced' ? sampleQuote.snapshot.credits : null,
    sampleDuration: model.defaultDuration,
    dimensions: {
      selectors,
      durations: model.durations,
      minDimensions: model.minDimensions,
      maxDimensions: model.maxDimensions,
      maxOutputs: model.maxOutputs,
      maxReferences: model.maxReferences,
      isBatchSupported: model.isBatchSupported,
      hasAudioToggle: model.hasAudioToggle,
      hasResolutionOptions: model.hasResolutionOptions,
    },
    reviewed,
    pending,
    status: hasMismatch
      ? 'discrepant'
      : reasons.length
        ? 'unresolved'
        : 'verified',
    reasons,
    attentionLevel: attention[0]?.level ?? null,
    attention,
    pendingRateChanges,
    isRateApprovalAvailable:
      hasRateDrift && pendingContract?.mappingStatus === 'supported',
    providerSyncStatus: model.providerSyncStatus,
    providerSyncFailureCode: model.providerSyncFailureCode,
    providerPricingSyncedAt:
      model.providerPricingSyncedAt?.toISOString() ?? null,
  };
}

function configuredMargin(
  setting: { marginMultiplierGeneration: number | null } | null,
): number | null {
  const value = setting?.marginMultiplierGeneration;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

@Injectable()
export class AdminModelPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(source: string): Promise<AdminModelPricingReport> {
    return this.prisma.$transaction(
      async (transaction) => {
        const retrievedAt = new Date().toISOString();
        const [models, setting] = await Promise.all([
          // Superadmin report over the platform-global model registry.
          crossOrgUnsafe(
            async () =>
              await transaction.model.findMany({
                where: { organizationId: null, isDeleted: false },
                orderBy: { key: 'asc' },
                select: pricingModelSelect,
              }),
          ),
          transaction.platformSetting.findFirst({
            where: { key: 'platform', isDeleted: false },
            select: { marginMultiplierGeneration: true },
          }),
        ]);
        const margin = configuredMargin(setting);
        return {
          id: 'model-pricing',
          retrievedAt,
          source,
          isConversionPolicyConfigured: margin !== null,
          marginMultiplierGeneration: margin,
          rows: models.map((model) =>
            projectAdminModelPricing(
              model,
              model.providerContracts,
              margin,
              retrievedAt,
            ),
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * Promote the pending provider rates to the reviewed contract (#6196). The
   * new rate takes effect from the next quote; approver and time are recorded
   * on the contract and the model. Registry fields (activation, schema, row
   * price) are untouched.
   */
  async approveRates(
    modelId: string,
    approvedBy: string,
  ): Promise<AdminModelPricingRow> {
    return this.prisma.$transaction(async (transaction) => {
      const retrievedAt = new Date();
      const [model, setting] = await Promise.all([
        // Superadmin action over the platform-global model registry.
        crossOrgUnsafe(
          async () =>
            await transaction.model.findFirst({
              where: { id: modelId, organizationId: null, isDeleted: false },
              select: pricingModelSelect,
            }),
        ),
        transaction.platformSetting.findFirst({
          where: { key: 'platform', isDeleted: false },
          select: { marginMultiplierGeneration: true },
        }),
      ]);
      if (!model) throw new NotFoundException('Model', modelId);
      const margin = configuredMargin(setting);
      const before = projectAdminModelPricing(
        model,
        model.providerContracts,
        margin,
        retrievedAt.toISOString(),
      );
      const pendingContract = model.providerContracts.find(
        (contract) => contract.version === model.pendingProviderContractVersion,
      );
      if (
        !before.isRateApprovalAvailable ||
        !pendingContract ||
        !model.pendingProviderContractVersion
      )
        throw new BadRequestException(NO_PROVIDER_RATE_ACTION);
      await transaction.modelProviderContract.update({
        data: {
          reviewStatus: 'approved',
          reviewedAt: retrievedAt,
          reviewedBy: approvedBy,
        },
        where: {
          provider_endpoint_version: {
            endpoint: pendingContract.endpoint,
            provider: pendingContract.provider,
            version: pendingContract.version,
          },
        },
      });
      await transaction.model.update({
        data: {
          pendingProviderContractVersion: null,
          providerSyncFailedAt: null,
          providerSyncFailureCode: null,
          providerSyncStatus: 'fresh',
          reviewedAt: retrievedAt,
          reviewedBy: approvedBy,
          reviewedProviderContractVersion: pendingContract.version,
          reviewStatus: 'approved',
        },
        where: { id: modelId, isDeleted: false, organizationId: null },
      });
      const refreshed = await crossOrgUnsafe(
        async () =>
          await transaction.model.findFirst({
            where: { id: modelId, organizationId: null, isDeleted: false },
            select: pricingModelSelect,
          }),
      );
      if (!refreshed) throw new NotFoundException('Model', modelId);
      return projectAdminModelPricing(
        refreshed,
        refreshed.providerContracts,
        margin,
        retrievedAt.toISOString(),
      );
    });
  }
}
