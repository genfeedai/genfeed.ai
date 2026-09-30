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
}

export interface AdminModelPricingReport {
  id: string;
  retrievedAt: string;
  source: string;
  isConversionPolicyConfigured: boolean;
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
