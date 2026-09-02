import { getAgentChatModel } from './agent-chat-models.constant';

export interface LlmVendorCostComputationInput {
  completionTokens: number;
  isByok: boolean;
  model: string;
  promptTokens: number;
}

/**
 * 1 USD = 1_000_000 micro-USD. Ledger stores integers to avoid float drift.
 */
export const LLM_VENDOR_COST_MICROS_PER_USD = 1_000_000;

export const LLM_GENERATION_TELEMETRY_EVENT = '$ai_generation';

/**
 * Compute platform vendor cost in micro-USD from catalogue list prices.
 * BYOK and self-hosted / unknown models are 0 — those are not our COGS.
 *
 * `promptPerMillion` is USD per 1M tokens, so
 * `tokens * usdPerMillion` is already micro-USD.
 */
export function computeLlmVendorCostMicros(
  input: LlmVendorCostComputationInput,
): number {
  if (input.isByok) {
    return 0;
  }

  const catalog = getAgentChatModel(input.model);
  if (!catalog || catalog.isSelfHosted) {
    return 0;
  }

  const promptMicros = input.promptTokens * catalog.pricing.promptPerMillion;
  const completionMicros =
    input.completionTokens * catalog.pricing.completionPerMillion;

  return Math.max(0, Math.round(promptMicros + completionMicros));
}

export function llmVendorCostMicrosToUsd(micros: number): number {
  return micros / LLM_VENDOR_COST_MICROS_PER_USD;
}

export function computeLlmPromptCostUsd(
  input: LlmVendorCostComputationInput,
): number {
  if (input.isByok) {
    return 0;
  }

  const catalog = getAgentChatModel(input.model);
  if (!catalog || catalog.isSelfHosted) {
    return 0;
  }

  return (input.promptTokens / 1_000_000) * catalog.pricing.promptPerMillion;
}

export function computeLlmCompletionCostUsd(
  input: LlmVendorCostComputationInput,
): number {
  if (input.isByok) {
    return 0;
  }

  const catalog = getAgentChatModel(input.model);
  if (!catalog || catalog.isSelfHosted) {
    return 0;
  }

  return (
    (input.completionTokens / 1_000_000) * catalog.pricing.completionPerMillion
  );
}
