/**
 * Per-generation media vendor-cost ledger contracts (companion to the LLM
 * ledger in llm-vendor-cost.interface.ts / #2361). Prompt content is
 * intentionally absent from every shape.
 */

/** Completion-time facts about one finalized media generation. */
export interface IMediaGenerationCostContext {
  brandId?: string | null;
  category: string;
  durationSeconds?: number | null;
  height?: number | null;
  ingredientId: string;
  modelKey?: string | null;
  organizationId?: string | null;
  width?: number | null;
}

export interface IMediaVendorCostRecordInput {
  realizedDurationSeconds?: number | null;
  realizedWidth?: number | null;
  realizedHeight?: number | null;
  costEvidence?: 'observed' | 'calculated' | 'byok' | 'unknown';
  brandId?: string | null;
  category: string;
  ingredientId?: string;
  isByok: boolean;
  model: string;
  organizationId: string;
  pricingType?: string | null;
  provider: string;
  units: number;
  vendorCostMicros: number;
}

export interface IMediaVendorCostRangeQuery {
  from: Date;
  organizationId: string;
  to: Date;
}

export interface IMediaVendorCostGroupCounts {
  _all: number;
}

export interface IMediaVendorCostGroupSums {
  units: number | null;
  vendorCostMicros: number | null;
}

export interface IMediaVendorCostGroupRow {
  _count: IMediaVendorCostGroupCounts;
  _sum: IMediaVendorCostGroupSums;
  isByok: boolean;
  model: string;
  provider: string;
}

export interface IMediaVendorCostModelAggregate {
  byokGenerationCount: number;
  generationCount: number;
  model: string;
  platformGenerationCount: number;
  provider: string;
  units: number;
  vendorCostMicros: number;
}
