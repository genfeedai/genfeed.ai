/**
 * Per-run spend cap (#4921 FR 1). Every generation and judge call is reserved
 * before dispatch and charged after it; crossing the cap throws
 * `SpendCapExceededError`, which the runner turns into a partial report
 * marked `aborted: 'spend'`.
 */

import {
  AGENT_CHAT_MODELS,
  AGENT_CREDIT_USD,
  type AgentChatModelPricing,
  getAgentChatModel,
} from '@genfeedai/contracts/constants';
import type {
  CallProvenance,
  EvalSpendLedger,
  SpendCharge,
  SpendSummary,
} from './contracts';

export class SpendCapExceededError extends Error {
  constructor(
    readonly maxCredits: number,
    readonly attemptedCredits: number,
  ) {
    super(
      `Spend cap reached: ${attemptedCredits.toFixed(4)} credits would exceed --max-credits=${maxCredits}`,
    );
    this.name = 'SpendCapExceededError';
  }
}

export class UnmeteredCallError extends Error {
  constructor(readonly model: string) {
    super(
      `Cannot meter spend for ${model}: the provider reported no cost and the model has no catalogue pricing`,
    );
    this.name = 'UnmeteredCallError';
  }
}

/** Eval spend is internal cost, so credits are vendor USD at 1 credit = $0.01. */
export function usdToCredits(usd: number): number {
  return usd / AGENT_CREDIT_USD;
}

/** Rough prompt size; only used to size a reservation, never to bill. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function priceUsd(
  pricing: AgentChatModelPricing,
  promptTokens: number,
  completionTokens: number,
): number {
  return (
    (promptTokens * pricing.promptPerMillion +
      completionTokens * pricing.completionPerMillion) /
    1_000_000
  );
}

/**
 * Catalogue price for an exact catalogue key. Null for anything the catalogue
 * cannot price honestly: unknown keys, retired aliases (their row prices the
 * replacement) and routers that settle from the provider's reported cost.
 */
export function catalogueCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const entry = getAgentChatModel(model);
  if (!entry || entry.key !== model || entry.usesExactProviderCost) {
    return null;
  }

  return priceUsd(entry.pricing, promptTokens, completionTokens);
}

/**
 * Worst-case cost used to reserve a call before dispatch. An unpriced model
 * is reserved at the priciest catalogued rate, for the same reason the agent
 * billing fallback is: an unknown key is more likely a frontier release than
 * a bargain.
 */
export function reservationCostUsd(
  model: string,
  promptTokens: number,
  maxCompletionTokens: number,
): number {
  const exact = catalogueCostUsd(model, promptTokens, maxCompletionTokens);
  if (exact !== null) {
    return exact;
  }

  return Math.max(
    ...AGENT_CHAT_MODELS.map((entry) =>
      priceUsd(entry.pricing, promptTokens, maxCompletionTokens),
    ),
  );
}

export class SpendLedger implements EvalSpendLedger {
  readonly calls: CallProvenance[] = [];
  private spentCredits = 0;
  private spentUsd = 0;
  private readonly byKind = { generation: 0, judge: 0 };

  constructor(readonly maxCredits: number) {
    if (!Number.isFinite(maxCredits) || maxCredits <= 0) {
      throw new Error('--max-credits must be a positive number');
    }
  }

  reserve(estimatedCredits: number): void {
    const attempted = this.spentCredits + Math.max(0, estimatedCredits);
    if (attempted > this.maxCredits) {
      throw new SpendCapExceededError(this.maxCredits, attempted);
    }
  }

  charge({ credits, kind, provenance }: SpendCharge): void {
    this.calls.push(provenance);
    this.spentCredits += credits;
    this.spentUsd += provenance.costUsd;
    this.byKind[kind] += credits;
    if (this.spentCredits > this.maxCredits) {
      throw new SpendCapExceededError(this.maxCredits, this.spentCredits);
    }
  }

  summary(): SpendSummary {
    return {
      byKind: { ...this.byKind },
      callCount: this.calls.length,
      maxCredits: this.maxCredits,
      spentCredits: this.spentCredits,
      spentUsd: this.spentUsd,
    };
  }
}
