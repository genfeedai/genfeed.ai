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
