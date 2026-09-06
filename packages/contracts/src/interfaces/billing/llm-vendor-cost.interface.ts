/**
 * Per-completion LLM vendor-cost ledger and telemetry contracts (#2361).
 * Prompt and completion content are intentionally absent from every shape.
 */

export interface ILlmCompletionCallContext {
  brandId?: string;
  runId?: string;
  threadId?: string;
  userId?: string;
}

export interface ILlmCompletionTelemetryEvent {
  workflowLedgerId?: string;
  brandId?: string;
  completionTokens: number;
  isByok: boolean;
  latencyMs: number;
  model: string;
  organizationId?: string;
  promptTokens: number;
  provider: string;
  runId?: string;
  threadId?: string;
  userId?: string;
  /** Exact provider charge when the response reports it. */
  vendorCostMicros?: number;
}

export interface ILlmVendorCostRecordInput {
  pricingSnapshot?: {
    source: string;
    fingerprint: string;
    promptPerMillion: number | null;
    completionPerMillion: number | null;
  };
  workflowLedgerId?: string;
  costEvidence?: 'observed' | 'calculated' | 'byok' | 'unknown' | 'pending';
  brandId?: string;
  completionTokens: number;
  isByok: boolean;
  latencyMs: number;
  model: string;
  organizationId: string;
  promptTokens: number;
  provider: string;
  runId?: string;
  threadId?: string;
  vendorCostMicros: number;
}

export interface ILlmVendorCostRangeQuery {
  from: Date;
  organizationId: string;
  to: Date;
}

export interface ILlmVendorCostGroupCounts {
  _all: number;
}

export interface ILlmVendorCostGroupSums {
  completionTokens: number | null;
  promptTokens: number | null;
  vendorCostMicros: number | null;
}

export interface ILlmVendorCostGroupRow {
  _count: ILlmVendorCostGroupCounts;
  _sum: ILlmVendorCostGroupSums;
  isByok: boolean;
  model: string;
  provider: string;
}

export interface ILlmVendorCostModelAggregate {
  byokCallCount: number;
  callCount: number;
  completionTokens: number;
  model: string;
  platformCallCount: number;
  promptTokens: number;
  provider: string;
  vendorCostMicros: number;
}

export interface ILlmGenerationTelemetryCosts {
  inputCostUsd: number;
  outputCostUsd: number;
  vendorCostMicros: number;
}

export interface ILlmGenerationTelemetryProperties {
  $ai_input_cost_usd: number;
  $ai_input_tokens: number;
  $ai_latency: number;
  $ai_model: string;
  $ai_output_cost_usd: number;
  $ai_output_tokens: number;
  $ai_provider: string;
  $ai_total_cost_usd: number;
  is_byok: boolean;
  brand_id?: string;
  organization_id?: string;
  run_id?: string;
  thread_id?: string;
  vendor_cost_micros: number;
}
