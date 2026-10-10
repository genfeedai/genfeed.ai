import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ModelBillablePricingProfile,
  ProviderBillingUnit,
  ReviewedProviderPricing,
  ReviewedProviderRate,
} from '@genfeedai/contracts/interfaces';
import {
  hashReviewedRateSheetEntry,
  hasPendingProviderRateDrift,
  parseReviewedVariantRules,
  variantRuleFields,
  variantRuleRange,
} from '@genfeedai/pricing';
import type { Model, ModelProviderContract } from '@genfeedai/prisma';
import { platformOrTenantScope } from '@libs/prisma/platform-scope';

type PricingModel = Pick<
  Model,
  | 'key'
  | 'provider'
  | 'isActive'
  | 'isDeleted'
  | 'isFree'
  | 'pricingType'
  | 'providerCostUsd'
  | 'cost'
  | 'costPerUnit'
  | 'minCost'
  | 'hasResolutionOptions'
  | 'hasAudioToggle'
  | 'providerInputSchema'
  | 'reviewedProviderContractVersion'
  | 'pendingProviderContractVersion'
  | 'endpoint'
>;
type PricingContract = Pick<
  ModelProviderContract,
  | 'provider'
  | 'endpoint'
  | 'version'
  | 'reviewStatus'
  | 'mappingStatus'
  | 'pricing'
  | 'conditionalDimensions'
  | 'discoveredAt'
  | 'lastSeenAt'
>;
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function selectors(
  value: unknown,
): Record<string, string | number | boolean> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return null;
  const candidate = record(value);
  if (
    Object.values(candidate).some(
      (item) => !['string', 'number', 'boolean'].includes(typeof item),
    )
  )
    return null;
  return candidate as Record<string, string | number | boolean>;
}
function unit(value: unknown): ProviderBillingUnit | null {
  switch (value) {
    case 'image':
      return 'output';
    case 'video_second':
    case 'second_of_video':
      return 'second';
    case 'request':
    case 'output':
    case 'second':
    case 'input-second':
    case 'megapixel':
    case 'input-megapixel':
    case 'frame':
    case 'input-token':
    case 'output-token':
    case 'video-token':
    case 'input-video-token':
    case 'character':
    case 'reference':
      return value;
    default:
      return null;
  }
}
/**
 * The normalized rates a contract carries, whatever its review state. Used for
 * the reviewed contract and for a pending candidate, whose rates are compared
 * together with frozen billing rules to detect financial drift. Unrelated
 * schema or provider version changes do not count.
 */
export function parseContractReviewedPricing(
  model: Pick<PricingModel, 'endpoint' | 'isFree' | 'provider'>,
  contract: Omit<PricingContract, 'reviewStatus' | 'mappingStatus'> | undefined,
): ReviewedProviderPricing | null {
  if (
    !contract ||
    contract.provider !== model.provider ||
    contract.endpoint !== model.endpoint
  )
    return null;
  const metadata = record(contract.pricing);
  // Replicate's curated-known-cost/reviewed-registry snapshots are not financial verification.
  if (
    metadata.source === 'curated-known-cost' ||
    metadata.source === 'reviewed-registry'
  )
    return null;
  const isFalSnapshot =
    model.provider === 'fal' && Array.isArray(contract.pricing);
  const sourceUrl = isFalSnapshot
    ? 'https://api.fal.ai/v1/models/pricing'
    : metadata.sourceUrl;
  // A Fal snapshot has no room for a date of its own. Its `lastSeenAt` moves
  // only when the refresh observed these exact rates (see the contract sync).
  const verifiedAt = isFalSnapshot
    ? contract.lastSeenAt.toISOString()
    : metadata.verifiedAt;
  if (
    typeof sourceUrl !== 'string' ||
    !sourceUrl.startsWith('https://') ||
    typeof verifiedAt !== 'string' ||
    !Number.isFinite(Date.parse(verifiedAt))
  )
    return null;
  const rawRates = isFalSnapshot ? contract.pricing : metadata.rates;
  if (!Array.isArray(rawRates) || rawRates.length === 0) return null;
  const rates: ReviewedProviderRate[] = [];
  for (const raw of rawRates) {
    const candidate = record(raw);
    const billedUnit = unit(candidate.unit);
    const when = selectors(
      isFalSnapshot ? candidate.conditionalDimensions : candidate.when,
    );
    const price = isFalSnapshot
      ? Number(candidate.unitPrice)
      : candidate.unitPriceUsd;
    if (
      !billedUnit ||
      !when ||
      typeof price !== 'number' ||
      !Number.isFinite(price) ||
      price < 0 ||
      (price === 0 && !model.isFree)
    )
      return null;
    if (
      isFalSnapshot &&
      (candidate.currency !== 'USD' ||
        candidate.endpoint !== model.endpoint ||
        typeof candidate.unitPrice !== 'string' ||
        !candidate.unitPrice.trim())
    )
      return null;
    if (!isFalSnapshot && typeof candidate.component !== 'string') return null;
    for (const field of ['includedUnits', 'minimumUnits', 'roundUnitsTo']) {
      if (
        candidate[field] !== undefined &&
        (typeof candidate[field] !== 'number' ||
          !Number.isFinite(candidate[field]) ||
          candidate[field] < 0)
      )
        return null;
    }
    if (
      candidate.isPerOutput !== undefined &&
      typeof candidate.isPerOutput !== 'boolean'
    )
      return null;
    rates.push({
      component: isFalSnapshot ? 'output' : String(candidate.component),
      unit: billedUnit,
      unitPriceUsd: price,
      when,
      ...(typeof candidate.isPerOutput === 'boolean'
        ? { isPerOutput: candidate.isPerOutput }
        : isFalSnapshot && ['second', 'megapixel'].includes(billedUnit)
          ? { isPerOutput: true }
          : {}),
      ...(typeof candidate.includedUnits === 'number'
        ? { includedUnits: candidate.includedUnits }
        : {}),
      ...(typeof candidate.minimumUnits === 'number'
        ? { minimumUnits: candidate.minimumUnits }
        : {}),
      ...(typeof candidate.roundUnitsTo === 'number'
        ? { roundUnitsTo: candidate.roundUnitsTo }
        : {}),
    });
  }
  if (!isFalSnapshot && metadata.currency !== 'USD') return null;
  if (
    metadata.invariantSelectors !== undefined &&
    (!Array.isArray(metadata.invariantSelectors) ||
      metadata.invariantSelectors.some((value) => typeof value !== 'string'))
  )
    return null;
  const variantRules =
    metadata.variantRules === undefined
      ? undefined
      : parseReviewedVariantRules(metadata.variantRules);
  if (variantRules === null) return null;
  if (
    variantRules?.some((rule) => {
      const applicable = rates.filter((rate) =>
        Object.hasOwn(rate.when, rule.selectorKey),
      );
      return (
        !applicable.length ||
        applicable.some(
          (rate) =>
            !variantRuleRange(rule).includes(rate.when[rule.selectorKey]),
        )
      );
    })
  )
    return null;
  return {
    ...(variantRules ? { variantRules } : {}),
    version: contract.version,
    currency: 'USD',
    sourceUrl,
    verifiedAt,
    reviewStatus: 'approved',
    isFree: model.isFree,
    rates,
    ...(Array.isArray(metadata.invariantSelectors)
      ? { invariantSelectors: metadata.invariantSelectors as string[] }
      : {}),
  };
}
function reviewedPricing(
  model: PricingModel,
  contract: PricingContract | undefined,
): ReviewedProviderPricing | null {
  if (
    !contract ||
    contract.version !== model.reviewedProviderContractVersion ||
    contract.reviewStatus !== 'approved' ||
    contract.mappingStatus !== 'supported'
  )
    return null;
  return parseContractReviewedPricing(model, contract);
}

/** Schema selectors that must be chosen before a variant can be priced. */
export function deriveRequiredSelectorKeys(
  properties: Record<string, unknown>,
  flags: {
    hasAudioToggle?: boolean | null;
    hasResolutionOptions?: boolean | null;
  } = {},
): string[] {
  const requiredSelectorKeys = [
    'resolution',
    'quality',
    'mode',
    'generate_audio',
    'audio',
    'fps',
  ].filter((key) => {
    const property = record(properties[key]);
    if (!Object.keys(property).length || property.const !== undefined)
      return false;
    return !Array.isArray(property.enum) || property.enum.length > 1;
  });
  if (
    flags.hasResolutionOptions &&
    !requiredSelectorKeys.includes('resolution')
  )
    requiredSelectorKeys.push('resolution');
  if (
    flags.hasAudioToggle &&
    !requiredSelectorKeys.some(
      (key) => key === 'audio' || key === 'generate_audio',
    )
  )
    requiredSelectorKeys.push('audio');
  return requiredSelectorKeys;
}

/** Internal raw pricing profile: never a serialized/virtual model display row. */
export function projectModelBillablePricingProfile(
  model: PricingModel,
  contracts: PricingContract[],
): ModelBillablePricingProfile {
  const contract = contracts.find(
    (candidate) => candidate.version === model.reviewedProviderContractVersion,
  );
  const properties = record(
    model.provider === 'crun'
      ? record(model.providerInputSchema).fields
      : record(model.providerInputSchema).properties,
  );
  const reviewed = reviewedPricing(model, contract);
  const ruleFields = variantRuleFields(reviewed?.variantRules ?? []);
  const reviewedSelectorKeys = new Set([
    ...(reviewed?.invariantSelectors ?? []),
    ...(reviewed?.rates.flatMap((rate) => Object.keys(rate.when)) ?? []),
  ]);
  const requiredSelectorKeys = [
    ...new Set([
      ...deriveRequiredSelectorKeys(properties, model)
        .map((key) =>
          // Legacy capability flags lack the provider field name. Prefer the
          // approved contract's spelling when there is no schema field to bind.
          key === 'audio' &&
          !Object.hasOwn(properties, 'audio') &&
          reviewedSelectorKeys.has('generate_audio') &&
          !reviewedSelectorKeys.has('audio')
            ? 'generate_audio'
            : key,
        )
        .filter((key) => !ruleFields.has(key)),
      ...(reviewed?.variantRules?.map((rule) => rule.selectorKey) ?? []),
    ]),
  ];
  const pendingContract = model.pendingProviderContractVersion
    ? contracts.find(
        (candidate) =>
          candidate.version === model.pendingProviderContractVersion,
      )
    : undefined;
  const pending = reviewed
    ? parseContractReviewedPricing(model, pendingContract)
    : null;
  return {
    key: model.key,
    provider: model.provider,
    isActive: model.isActive,
    isDeleted: model.isDeleted,
    isFree: model.isFree,
    pricingType: model.pricingType,
    providerCostUsd: model.providerCostUsd,
    cost: model.cost,
    costPerUnit: model.costPerUnit,
    minCost: model.minCost,
    reviewedPricing: reviewed,
    rateVersion: model.reviewedProviderContractVersion,
    hasPendingRate: hasPendingProviderRateDrift(
      reviewed ? hashReviewedRateSheetEntry(reviewed) : null,
      pending ? hashReviewedRateSheetEntry(pending) : null,
    ),
    requiredSelectorKeys,
    requiresReviewedRates:
      model.provider === 'crun' ||
      model.pricingType === 'conditional' ||
      requiredSelectorKeys.length > 0 ||
      Object.keys(record(contract?.conditionalDimensions)).length > 0,
  };
}

/** Exact catalog lookup: the supplied tenant plus global rows, excluding deletes. */
export async function findModelBillablePricingProfile(
  prisma: PrismaService,
  key: string,
  organizationId?: string,
): Promise<ModelBillablePricingProfile | null> {
  // tenant-scope-ignore: this catalog lookup explicitly permits only the supplied organization or global organizationId:null rows and excludes soft deletes.
  const model = await prisma.model.findFirst({
    where: {
      key,
      isDeleted: false,
      ...platformOrTenantScope(organizationId),
    },
    select: {
      key: true,
      endpoint: true,
      provider: true,
      isActive: true,
      isDeleted: true,
      isFree: true,
      pricingType: true,
      providerCostUsd: true,
      cost: true,
      costPerUnit: true,
      minCost: true,
      hasResolutionOptions: true,
      hasAudioToggle: true,
      providerInputSchema: true,
      reviewedProviderContractVersion: true,
      pendingProviderContractVersion: true,
      providerContracts: {
        select: {
          provider: true,
          endpoint: true,
          version: true,
          reviewStatus: true,
          mappingStatus: true,
          pricing: true,
          conditionalDimensions: true,
          discoveredAt: true,
          lastSeenAt: true,
        },
      },
    },
  });
  return model
    ? projectModelBillablePricingProfile(model, model.providerContracts)
    : null;
}
