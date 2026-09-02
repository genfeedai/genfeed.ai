import type {
  ILlmCompletionTelemetryEvent,
  ILlmGenerationTelemetryCosts,
  ILlmGenerationTelemetryProperties,
} from '@genfeedai/contracts/interfaces';

/**
 * Allowlisted PostHog `$ai_generation` properties. Never copies messages,
 * prompt text, or completion content from the LLM response.
 */
export function buildLlmGenerationTelemetryProperties(
  event: ILlmCompletionTelemetryEvent,
  costs: ILlmGenerationTelemetryCosts,
): ILlmGenerationTelemetryProperties {
  const properties: ILlmGenerationTelemetryProperties = {
    $ai_input_cost_usd: costs.inputCostUsd,
    $ai_input_tokens: event.promptTokens,
    $ai_latency: event.latencyMs,
    $ai_model: event.model,
    $ai_output_cost_usd: costs.outputCostUsd,
    $ai_output_tokens: event.completionTokens,
    $ai_provider: event.provider,
    $ai_total_cost_usd: costs.vendorCostMicros / 1_000_000,
    is_byok: event.isByok,
    vendor_cost_micros: costs.vendorCostMicros,
  };

  if (event.organizationId) {
    properties.organization_id = event.organizationId;
  }
  if (event.brandId) {
    properties.brand_id = event.brandId;
  }
  if (event.runId) {
    properties.run_id = event.runId;
  }
  if (event.threadId) {
    properties.thread_id = event.threadId;
  }

  return properties;
}
