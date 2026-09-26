/**
 * Helpers shared by the text suites: judging one text with every configured
 * judge, the per-row cost/latency roll-up, and small statistics.
 */

import type {
  CallProvenance,
  CallTotals,
  EvalSpendLedger,
  FixtureRow,
  JudgedText,
  JudgeVote,
  ScoredRow,
  SuiteContext,
  ThresholdCheck,
} from '../contracts';

/** Every configured judge scores the text alone; the score is their mean. */
export async function judgeText(
  context: SuiteContext,
  row: FixtureRow,
  output: string,
): Promise<JudgedText> {
  const votes: JudgeVote[] = [];
  const callIds: string[] = [];
  const failures: string[] = [];

  for (const judgeRegistryKey of context.config.judgeRegistryKeys) {
    const judgement = await context.judge.pointwise({
      judgeRegistryKey,
      output,
      row,
    });
    votes.push(judgement.vote);
    if (judgement.callId) {
      callIds.push(judgement.callId);
    }
    if (judgement.failure) {
      failures.push(`${judgeRegistryKey}: ${judgement.failure}`);
    }
  }

  return { callIds, failures, score: mean(scoresOf(votes)), votes };
}

export function scoresOf(votes: JudgeVote[]): number[] {
  return votes
    .map((vote) => vote.score)
    .filter((score): score is number => score !== null);
}

export function callsById(
  ledger: EvalSpendLedger,
): Map<string, CallProvenance> {
  return new Map(ledger.calls.map((call) => [call.callId, call]));
}

export function sumCalls(
  ledger: EvalSpendLedger,
  callIds: string[],
): CallTotals {
  const byId = callsById(ledger);
  return callIds.reduce(
    (total, callId) => {
      const call = byId.get(callId);
      return call
        ? {
            credits: total.credits + call.credits,
            latencyMs: total.latencyMs + call.latencyMs,
          }
        : total;
    },
    { credits: 0, latencyMs: 0 },
  );
}

export function humanLabelOf(row: FixtureRow): ScoredRow['humanLabel'] {
  const { decision, scoreBand } = row.expected;
  if (!decision && !scoreBand) {
    return null;
  }

  return { band: scoreBand ?? null, decision: decision ?? null };
}

export function mean(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

export function percentile(values: number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );

  return sorted[index] ?? 0;
}

export function atMost(
  id: string,
  subject: string,
  actual: number | null,
  threshold: number,
): ThresholdCheck {
  return {
    actual,
    comparator: '<=',
    id,
    passed: actual === null || actual <= threshold,
    subject,
    threshold,
  };
}

export function atLeast(
  id: string,
  subject: string,
  actual: number | null,
  threshold: number,
): ThresholdCheck {
  return {
    actual,
    comparator: '>=',
    id,
    passed: actual !== null && actual >= threshold,
    subject,
    threshold,
  };
}
