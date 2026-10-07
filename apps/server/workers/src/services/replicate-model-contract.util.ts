import { deriveRequiredSelectorKeys } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import {
  classifyReplicateSchemaFamily,
  extractReplicateEndpointSchemas,
  type ReplicateEndpointSchemas,
} from '@api/services/integrations/replicate/services/replicate-contract';
import { ModelCategory, PricingType } from '@genfeedai/contracts';
import type {
  ReviewedProviderRate,
  ReviewedVariantRule,
} from '@genfeedai/contracts/interfaces';
import {
  mapReplicateBillingTiers,
  type ReplicateBillingObservation,
} from '@genfeedai/pricing';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { hashReplicateProviderContract } from '@libs/utils/provider-contract.util';
import type { IReplicateModel } from '@workers/interfaces/model-discovery.interface';

export interface ReplicateContractPricing {
  /** What the public model page said about billing (#6196). */
  billing?: ReplicateBillingObservation;
  pricingType: string | null;
  source: 'curated-known-cost' | 'reviewed-registry';
  unitPriceUsd: number | null;
}

interface ObservedRates {
  invariantSelectors: string[];
  rates: ReviewedProviderRate[];
  variantRules?: ReviewedVariantRule[];
  selectorKeys: string[];
  sourceUrl: string;
}

export interface ReplicateCandidateContract {
  billingFailure: string | null;
  billingUnit: string | null;
  currency: string | null;
  inputSchema: Record<string, unknown>;
  mappingStatus: 'quarantined' | 'supported';
  observed: ObservedRates | null;
  openapi: Record<string, unknown>;
  openapiVersion: string | null;
  outputSchema: Record<string, unknown>;
  pricing: unknown;
  pricingType: string | null;
  schemaFamily: string | null;
  unitPrice: string | null;
  unitPriceMicros: bigint | null;
  unsupportedReason: string | null;
  version: string;
}

const SUPPORTED_PRICING_TYPES = new Set<string>(Object.values(PricingType));
export const REPLICATE_BILLING_SOURCE = 'replicate-billing-config';

function billingUnitForPricingType(pricingType: string): string {
  switch (pricingType) {
    case PricingType.PER_MEGAPIXEL:
      return 'megapixel';
    case PricingType.PER_SECOND:
      return 'second';
    default:
      return 'request';
  }
}

export function prepareReplicateModelContract(
  endpoint: string,
  model: IReplicateModel,
  category: ModelCategory,
  pricing: ReplicateContractPricing,
  now: Date,
): ReplicateCandidateContract {
  const openapi = isRecord(model.latest_version?.openapi_schema)
    ? model.latest_version.openapi_schema
    : {};
  let schemas: ReplicateEndpointSchemas = { input: {}, output: {} };
  let schemaFamily: string | null = null;
  let unsupportedReason: string | null = null;

  try {
    schemas = extractReplicateEndpointSchemas(openapi);
    schemaFamily = classifyReplicateSchemaFamily(
      category,
      schemas.input,
      schemas.output,
    );
    if (!schemaFamily) unsupportedReason = 'unsupported_schema_family';
  } catch {
    unsupportedReason = 'invalid_or_missing_openapi';
  }

  const { billingFailure, observed } = observeRates(
    pricing.billing,
    schemas.input,
    endpoint,
  );

  const hasCuratedPricing =
    typeof pricing.unitPriceUsd === 'number' &&
    Number.isFinite(pricing.unitPriceUsd) &&
    pricing.unitPriceUsd > 0 &&
    typeof pricing.pricingType === 'string' &&
    SUPPORTED_PRICING_TYPES.has(pricing.pricingType);
  const hasPricing = observed !== null || hasCuratedPricing;
  if (!hasPricing) unsupportedReason ??= 'missing_reviewed_pricing';

  // Rates the page states outrank the curated registry value.
  const observedSnapshot = observed
    ? {
        currency: 'USD',
        rates: observed.rates,
        ...(observed.variantRules
          ? { variantRules: observed.variantRules }
          : {}),
        source: REPLICATE_BILLING_SOURCE,
        sourceUrl: observed.sourceUrl,
        ...(observed.invariantSelectors.length
          ? { invariantSelectors: observed.invariantSelectors }
          : {}),
      }
    : null;
  const pricingSnapshot: unknown = observedSnapshot
    ? { ...observedSnapshot, verifiedAt: now.toISOString() }
    : hasCuratedPricing
      ? [
          {
            currency: 'USD',
            pricingType: pricing.pricingType,
            source: pricing.source,
            unitPrice: String(pricing.unitPriceUsd),
          },
        ]
      : pricing.billing?.status === 'ok'
        ? {
            rawTiers: pricing.billing.tiers,
            source: REPLICATE_BILLING_SOURCE,
            sourceUrl: pricing.billing.sourceUrl,
            mappingFailure: billingFailure,
          }
        : [];
  const supported = Boolean(schemaFamily && hasPricing);
  // `verifiedAt` is a moving date, so it stays out of the version identity.
  const candidateWithoutVersion = {
    endpoint,
    inputSchema: schemas.input,
    openapi,
    outputSchema: schemas.output,
    pricing: observedSnapshot ?? pricingSnapshot,
    providerVersion: model.latest_version?.id ?? null,
    schemaFamily,
  };
  const single =
    observed && observed.rates.length === 1 ? observed.rates[0] : undefined;

  return {
    billingFailure,
    billingUnit: observed
      ? (observed.rates[0]?.unit ?? null)
      : hasCuratedPricing && pricing.pricingType
        ? billingUnitForPricingType(pricing.pricingType)
        : null,
    currency: hasPricing ? 'USD' : null,
    inputSchema: schemas.input,
    mappingStatus: supported ? 'supported' : 'quarantined',
    observed,
    openapi,
    openapiVersion:
      typeof openapi.openapi === 'string' ? openapi.openapi : null,
    outputSchema: schemas.output,
    pricing: pricingSnapshot,
    pricingType: observed
      ? observed.selectorKeys.length === 0 && observed.rates.length === 1
        ? 'flat'
        : 'conditional'
      : hasCuratedPricing
        ? pricing.pricingType
        : null,
    schemaFamily,
    unitPrice: single
      ? String(single.unitPriceUsd)
      : observed
        ? null
        : hasCuratedPricing
          ? String(pricing.unitPriceUsd)
          : null,
    unitPriceMicros: single
      ? BigInt(Math.round(single.unitPriceUsd * 1_000_000))
      : observed
        ? null
        : hasCuratedPricing
          ? BigInt(Math.round((pricing.unitPriceUsd as number) * 1_000_000))
          : null,
    unsupportedReason,
    version: hashReplicateProviderContract(candidateWithoutVersion),
  };
}

/** Map the page's billing tiers onto this model's own input fields. */
function observeRates(
  billing: ReplicateBillingObservation | undefined,
  inputSchema: Record<string, unknown>,
  endpoint: string,
): { billingFailure: string | null; observed: ObservedRates | null } {
  if (!billing)
    return { billingFailure: 'no_billing_observation', observed: null };
  if (billing.status === 'unavailable')
    return { billingFailure: billing.reason, observed: null };
  const properties = isRecord(inputSchema.properties)
    ? inputSchema.properties
    : {};
  const mapping = mapReplicateBillingTiers(billing.tiers, properties, endpoint);
  if (mapping.status === 'failed')
    return { billingFailure: mapping.reason, observed: null };
  const priced = new Set(mapping.selectorKeys);
  return {
    billingFailure: null,
    observed: {
      // Schema selectors the tiers do not price on never change the price.
      invariantSelectors: deriveRequiredSelectorKeys(properties).filter(
        (key) => !priced.has(key),
      ),
      rates: mapping.rates,
      ...(mapping.variantRules ? { variantRules: mapping.variantRules } : {}),
      selectorKeys: mapping.selectorKeys,
      sourceUrl: billing.sourceUrl,
    },
  };
}
