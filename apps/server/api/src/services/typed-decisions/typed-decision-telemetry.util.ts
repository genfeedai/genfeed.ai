import type {
  TypedDecisionTelemetryProperties,
  TypedDecisionTelemetryRecord,
} from '@genfeedai/contracts/interfaces';

/**
 * Allowlisted PostHog properties for one typed decision. Never copies the
 * state, the question or any prompt text — same posture as
 * `buildLlmGenerationTelemetryProperties`.
 *
 * `is_agreement` is what shadow mode is for: it is only meaningful when the
 * call site supplied the answer its deterministic path produced.
 */
export function buildTypedDecisionTelemetryProperties(
  record: TypedDecisionTelemetryRecord,
): TypedDecisionTelemetryProperties {
  const properties: TypedDecisionTelemetryProperties = {
    decision_point: record.decisionPoint,
    kind: record.kind,
    latency_ms: record.latencyMs,
    mode: record.mode,
    provider: record.provider,
  };

  if (record.answer !== undefined) {
    properties.answer = record.answer;
  }
  if (record.confidence !== undefined) {
    properties.confidence = record.confidence;
  }
  if (record.deterministicAnswer !== undefined) {
    properties.deterministic_answer = record.deterministicAnswer;
  }
  if (record.answer !== undefined && record.deterministicAnswer !== undefined) {
    properties.is_agreement = record.answer === record.deterministicAnswer;
  }
  if (record.failureReason) {
    properties.failure_reason = record.failureReason;
  }
  if (record.retryAfterSeconds !== undefined) {
    properties.retry_after_seconds = record.retryAfterSeconds;
  }
  if (record.usage) {
    properties.input_tokens = record.usage.inputTokens;
    properties.output_tokens = record.usage.outputTokens;
    properties.vendor_model = record.usage.model;
    if (record.usage.vendorCostMicros !== undefined) {
      properties.vendor_cost_micros = record.usage.vendorCostMicros;
    }
  }
  if (record.organizationId) {
    properties.organization_id = record.organizationId;
  }
  if (record.brandId) {
    properties.brand_id = record.brandId;
  }
  if (record.runId) {
    properties.run_id = record.runId;
  }
  if (record.threadId) {
    properties.thread_id = record.threadId;
  }

  return properties;
}
