export type ProviderBillingUnit =
  | 'request'
  | 'output'
  | 'second'
  | 'input-second'
  | 'megapixel'
  | 'input-megapixel'
  | 'frame'
  | 'input-token'
  | 'output-token'
  | 'character'
  | 'reference';

export interface ProviderQuoteDimensions {
  requests?: number;
  duration?: number;
  width?: number;
  height?: number;
  outputs?: number;
  inputDuration?: number;
  inputMegapixels?: number;
  frames?: number;
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
  references?: number;
  selectors?: Record<string, string | number | boolean>;
}

export interface ReviewedProviderRate {
  component: string;
  unit: ProviderBillingUnit;
  unitPriceUsd: number;
  when: Record<string, string | number | boolean>;
  isPerOutput?: boolean;
  includedUnits?: number;
  minimumUnits?: number;
  roundUnitsTo?: number;
}

export interface ReviewedProviderPricing {
  version?: string;
  invariantSelectors?: string[];
  currency: string;
  sourceUrl: string;
  verifiedAt: string;
  reviewStatus: string;
  isFree?: boolean;
  rates: ReviewedProviderRate[];
}

export type ProviderCostQuote =
  | { status: 'priced'; providerCostUsd: number; credits: number }
  | { status: 'unresolved'; reason: string };

export interface ModelPricingEvidence {
  version: string;
  reviewStatus: string;
  currency: string | null;
  billingUnit: string | null;
  unitPrice: string | null;
  conditionalDimensions: Record<string, unknown>;
  mappingStatus: string;
  observedAt: string;
  source: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  rates: ReviewedProviderRate[] | null;
}

/** One variant whose provider price differs between two rate sets. */
export interface ModelPricingRateChange {
  /** Stable selector label, for example `duration=6 · resolution=768P`. */
  variant: string;
  component: string;
  unit: ProviderBillingUnit;
  /** Null when the variant is new. */
  oldPriceUsd: number | null;
  /** Null when the variant disappeared. */
  newPriceUsd: number | null;
  /** Included units, minimums, rounding or per-output billing changed. */
  hasTermsChange?: boolean;
}

/** Red = the model cannot be priced. Orange = a price needs an operator's review. */
export type ModelPricingAttentionLevel = 'red' | 'orange';

export type ModelPricingAttentionCode =
  | 'price_missing'
  | 'zero_credits'
  | 'unpriceable'
  | 'price_change_pending'
  | 'refresh_failed'
  | 'refresh_stale';

export interface ModelPricingAttention {
  level: ModelPricingAttentionLevel;
  code: ModelPricingAttentionCode;
  reason: string;
}

export interface AdminModelPricingRow {
  id: string;
  key: string;
  provider: string;
  category: string;
  isActive: boolean;
  isFree: boolean;
  lifecycle: string;
  pricingType: string | null;
  configuredCost: number;
  configuredCostPerUnit: number | null;
  configuredMinCost: number | null;
  configuredProviderCostUsd: number | null;
  inputCostPerMillionTokens: number | null;
  outputCostPerMillionTokens: number | null;
  effectiveUnitCredits: number | null;
  effectiveSampleCredits: number | null;
  sampleDuration: number | null;
  dimensions: Record<string, unknown>;
  reviewed: ModelPricingEvidence | null;
  pending: ModelPricingEvidence | null;
  status: 'verified' | 'discrepant' | 'unresolved';
  reasons: string[];
  /** Highest-severity attention item, or null when the model needs nothing. */
  attentionLevel: ModelPricingAttentionLevel | null;
  /** Red items first, then orange. */
  attention: ModelPricingAttention[];
  /** Variant-level difference between the reviewed and the pending provider rates. */
  pendingRateChanges: ModelPricingRateChange[];
  /** True when the pending contract holds different, parseable rates an operator can approve. */
  isRateApprovalAvailable: boolean;
  providerSyncStatus: string | null;
  providerSyncFailureCode: string | null;
  providerPricingSyncedAt: string | null;
}

export interface AdminModelPricingReport {
  id: string;
  retrievedAt: string;
  source: string;
  isConversionPolicyConfigured: boolean;
  marginMultiplierGeneration: number | null;
  rows: AdminModelPricingRow[];
}

export interface ModelBillablePricingProfile {
  key: string;
  provider: string;
  isActive: boolean;
  isDeleted: boolean;
  isFree: boolean;
  pricingType: string | null;
  providerCostUsd: number | null;
  cost: number;
  costPerUnit: number | null;
  minCost: number | null;
  reviewedPricing: ReviewedProviderPricing | null;
  rateVersion: string | null;
  hasPendingRate: boolean;
  requiresReviewedRates: boolean;
  requiredSelectorKeys: string[];
  /** Trusted admission policy, frozen with the quote; never inferred at settlement. */
  requestCompletionPolicy?: 'successful-request' | 'fractional-subsidy';
}

export interface ModelBillableQuoteRequest extends ProviderQuoteDimensions {
  modelKey: string;
  provider: string;
}

/** Internal frozen provider acceptance tariff; never exposed by public serializers. */
export interface CrunProviderQuoteSnapshot {
  provider: 'crun';
  estimated: false;
  providerCreditsPerTask: string;
  quoteHash: string;
  inputHash: string;
  contractVersion: string;
  creditsPerUsd: string | null;
  acquisitionRateVersion: string | null;
  credentialSource: 'hosted' | 'byok';
  credentialId: string | null;
  credentialFingerprint: string;
}

export interface ModelBillableQuoteSnapshot {
  modelKey: string;
  provider: string;
  rateVersion: string | null;
  quotedAt: string;
  marginMultiplier: number | null;
  quantities: ProviderQuoteDimensions;
  costSource:
    | 'reviewed-provider'
    | 'configured-provider'
    | 'legacy-credits'
    | 'explicit-free';
  providerCostUsd: number | null;
  credits: number;
  allocationBasis: 'request' | 'output';
  /** Reservation allocation only; never sum these positions for partial settlement. */
  allocatedCredits: number[];
  /** Internal immutable rate inputs; public quote serializers must omit these. */
  pricingProfile: ModelBillablePricingProfile;
  providerQuote?: CrunProviderQuoteSnapshot;
}

export type ModelBillableQuote =
  | { status: 'priced'; snapshot: ModelBillableQuoteSnapshot }
  | { status: 'unresolved'; reason: string };

export interface ModelBillableCompletionInput extends ProviderQuoteDimensions {
  completedOutputs: number;
  successfulRequests: number;
}

export type ModelBillableCompletionQuote =
  | {
      status: 'priced';
      credits: number;
      billableProviderCostUsd: number | null;
    }
  | { status: 'unresolved'; reason: string };
