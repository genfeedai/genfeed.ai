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
  EvalUsage,
  ReservationTokens,
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

/**
 * Thrown by a dispatcher when a call fails. Carries whatever usage the
 * provider reported before the failure (a schema repair retry is two billed
 * calls), or null when nothing is known — the ledger then charges the
 * reservation, because a timed-out call may still have been billed.
 */
export class EvalDispatchError extends Error {
  constructor(
    message: string,
    readonly usage: EvalUsage | null,
    readonly provider: string | null,
    readonly latencyMs: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'EvalDispatchError';
  }
}

/** The dispatcher's structured-output helper retries once with a repair prompt. */
export const STRUCTURED_REPAIR_RETRIES = 1;

/** Eval spend is internal cost, so credits are vendor USD at 1 credit = $0.01. */
export function usdToCredits(usd: number): number {
  return usd / AGENT_CREDIT_USD;
}

/** Rough token count for the stub's synthetic usage; never used to bill. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Upper bound on a prompt's tokens: a BPE token is at least one UTF-8 byte,
 * so the byte length never undercounts, whatever the script or JSON density.
 */
export function upperBoundTokens(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/**
 * Worst-case tokens for one structured call including the repair retry,
 * whose prompt repeats the original plus the rejected answer.
 */
export function reservationTokens(
  promptTokens: number,
  maxCompletionTokens: number,
): ReservationTokens {
  const attempts = 1 + STRUCTURED_REPAIR_RETRIES;
  return {
    completion: attempts * maxCompletionTokens,
    prompt:
      attempts * promptTokens + STRUCTURED_REPAIR_RETRIES * maxCompletionTokens,
  };
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
  const tokens = reservationTokens(promptTokens, maxCompletionTokens);
  const exact = catalogueCostUsd(model, tokens.prompt, tokens.completion);
  if (exact !== null) {
    return exact;
  }

  return Math.max(
    ...AGENT_CHAT_MODELS.map((entry) =>
      priceUsd(entry.pricing, tokens.prompt, tokens.completion),
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
