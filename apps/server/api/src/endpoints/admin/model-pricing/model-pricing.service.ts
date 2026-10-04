import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  AdminModelPricingReport,
  AdminModelPricingRow,
  ModelPricingEvidence,
} from '@genfeedai/contracts/interfaces';
import {
  hasPendingProviderRateDrift,
  quoteModelBillablePricing,
} from '@genfeedai/pricing';
import {
  type Model,
  type ModelProviderContract,
  Prisma,
} from '@genfeedai/prisma';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Injectable } from '@nestjs/common';

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

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function evidence(
  contract: PricingContract | undefined,
): ModelPricingEvidence | null {
  if (!contract) return null;
  const pricing = Array.isArray(contract.pricing)
    ? asRecord(contract.pricing[0])
    : asRecord(contract.pricing);
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
    conditionalDimensions: asRecord(contract.conditionalDimensions),
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
  const hasPolicy =
    typeof margin === 'number' && Number.isFinite(margin) && margin > 0;
  const rate = model.providerCostUsd;
  const hasRate =
    typeof rate === 'number' &&
    Number.isFinite(rate) &&
    (rate > 0 || (rate === 0 && model.isFree));
  if (!hasPolicy) reasons.push('Configured conversion policy unavailable');
  if (!hasRate)
    reasons.push(
      'Configured provider USD unavailable; stored credits do not verify provider cost',
    );
  if (reviewed?.reviewStatus !== 'approved')
    reasons.push('No approved provider pricing evidence');
  if (reviewed && Object.keys(reviewed.conditionalDimensions).length > 0)
    reasons.push('Conditional provider rates require variant reconciliation');
  if (
    reviewed &&
    (reviewed.currency !== 'USD' || !priceTypeForUnit(reviewed.billingUnit))
  )
    reasons.push('Provider currency or billed unit unsupported');
  if (reviewed) {
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
    else if (age > 30 * 86_400_000)
      reasons.push('Provider rate verification is older than 30 days');
  }
  if (
    hasPendingProviderRateDrift(
      model.reviewedProviderContractVersion,
      model.pendingProviderContractVersion,
    )
  )
    reasons.push(
      'Pending provider contract requires review before reconciliation',
    );
  if (model.category === 'text')
    reasons.push(
      'Text uses actual answering-model token/usage settlement; catalog sample is not a token quote',
    );
  const identity = { modelKey: model.key, provider: model.provider };
  const unitQuote = quoteModelBillablePricing(
    profile,
    { ...identity, duration: 1, width: 1000, height: 1000 },
    margin,
    retrievedAt,
  );
  const sampleQuote = quoteModelBillablePricing(
    profile,
    {
      ...identity,
      ...(model.defaultDuration !== null
        ? { duration: model.defaultDuration }
        : {}),
    },
    margin,
    retrievedAt,
  );
  if (unitQuote.status === 'unresolved') reasons.push(unitQuote.reason);
  const hasMismatch =
    !!reviewed &&
    reviewed.unitPrice !== null &&
    reviewed.unitPrice.trim() !== '' &&
    Number.isFinite(Number(reviewed.unitPrice)) &&
    priceTypeForUnit(reviewed.billingUnit) !== null &&
    hasRate &&
    (Number(reviewed.unitPrice) !== rate ||
      priceTypeForUnit(reviewed.billingUnit) !== (model.pricingType || 'flat'));
  if (hasMismatch)
    reasons.push('Approved provider rate/unit differs from configured row');
  if (model.cost === 0 && !model.isFree && !hasRate)
    reasons.push(
      'Zero stored credits are unresolved, not an explicit free model',
    );
  const schema = asRecord(model.providerInputSchema);
  const properties = asRecord(schema.properties);
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
      const property = asRecord(properties[key]);
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
  };
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
        const configuredMargin = setting?.marginMultiplierGeneration;
        const margin =
          typeof configuredMargin === 'number' &&
          Number.isFinite(configuredMargin) &&
          configuredMargin > 0
            ? configuredMargin
            : null;
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
}
