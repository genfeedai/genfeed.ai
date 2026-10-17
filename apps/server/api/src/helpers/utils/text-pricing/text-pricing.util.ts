import {
  calculateAgentExactCredits,
  calculateAgentProviderCostUsd,
} from '@genfeedai/contracts/constants';
import { getRuntimeAgentChatMarginMultiplier } from '@genfeedai/pricing';

type TextPricedModel = {
  cost?: number | null;
  pricingType?: string | null;
  minCost?: number | null;
  inputCostPerMillionTokens?: number | null;
  outputCostPerMillionTokens?: number | null;
};

export function extractBillableText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractBillableText(item)).join(' ');
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((item) => extractBillableText(item))
      .join(' ');
  }

  return '';
}

export function estimateTextTokens(value: unknown): number {
  const text = extractBillableText(value).trim();

  if (!text) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}

/** Text calls are charged to this many decimals (0.01 credit = $0.0001). */
const TEXT_CREDIT_DECIMALS = 2;

/** Round up to the charge precision; a used call never rounds down to free. */
export function roundUpTextCredits(credits: number): number {
  if (!Number.isFinite(credits) || credits <= 0) {
    return 0;
  }

  const factor = 10 ** TEXT_CREDIT_DECIMALS;
  // toFixed(6) strips float noise (0.07 * 100 = 7.000000000000001) before ceil.
  return Math.ceil(Number((credits * factor).toFixed(6))) / factor;
}

/**
 * Admission gate, never the charge: the balance a caller needs before the
 * model runs. Per-token models gate on one whole credit; the bill itself is
 * {@link calculateEstimatedTextCredits}.
 */
export function getMinimumTextCredits(model: TextPricedModel): number {
  if (model.pricingType === 'per-token') {
    return 1;
  }

  return model.minCost || model.cost || 0;
}

function hasTokenRates(model: TextPricedModel): boolean {
  return (
    (model.inputCostPerMillionTokens || 0) > 0 ||
    (model.outputCostPerMillionTokens || 0) > 0
  );
}

/**
 * Credits for one text call, to two decimals, from the tokens it used.
 *
 * - `per-token` rows hold their rates in credits per million tokens.
 * - Any other row with token rates holds provider USD per million tokens (the
 *   catalog seed): the bill is provider USD × the agent-chat margin knob, the
 *   same formula an agent round settles at.
 * - A row with no token rates is a flat per-call price.
 *
 * No minimum: a short call costs a fraction of a credit.
 */
export function calculateEstimatedTextCredits(
  model: TextPricedModel,
  input: unknown,
  output: string,
): number {
  const isPerToken = model.pricingType === 'per-token';
  if (!isPerToken && !hasTokenRates(model)) {
    return model.cost || 0;
  }

  const promptTokens = estimateTextTokens(input);
  const completionTokens = estimateTextTokens(output);
  if (promptTokens + completionTokens === 0) {
    return 0;
  }

  if (isPerToken) {
    // A per-token row with no rates is misconfigured; bill the admission
    // minimum rather than let the call run free.
    if (!hasTokenRates(model)) {
      return getMinimumTextCredits(model);
    }

    return roundUpTextCredits(
      (promptTokens * (model.inputCostPerMillionTokens || 0) +
        completionTokens * (model.outputCostPerMillionTokens || 0)) /
        1_000_000,
    );
  }

  return roundUpTextCredits(
    calculateAgentExactCredits(
      calculateAgentProviderCostUsd(
        {
          completionPerMillion: model.outputCostPerMillionTokens || 0,
          promptPerMillion: model.inputCostPerMillionTokens || 0,
        },
        { completionTokens, promptTokens },
      ),
      getRuntimeAgentChatMarginMultiplier(),
    ),
  );
}
