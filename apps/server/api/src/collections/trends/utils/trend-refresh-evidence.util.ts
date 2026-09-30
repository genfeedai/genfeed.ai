import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  TrendRefreshDataset,
  TrendRefreshHealth,
  TrendRefreshOutcome,
  TrendRefreshReason,
} from '@genfeedai/contracts/interfaces';

const attempts = new AsyncLocalStorage<TrendRefreshHealth[]>();
const current = new AsyncLocalStorage<TrendRefreshHealth>();
const skipped = new WeakSet<TrendRefreshHealth>();

/** Each concurrent workflow action owns its evidence; no shared mutable provider state. */
export async function captureTrendRefreshEvidence<T>(
  work: () => Promise<T>,
  persist?: (evidence: TrendRefreshHealth[]) => Promise<void>,
) {
  const evidence: TrendRefreshHealth[] = [];
  return attempts.run(evidence, async () => {
    try {
      const result = await work();
      return { evidence, result };
    } catch (error: unknown) {
      for (const attempt of evidence) {
        if (!attempt.outcome.endsWith('failed'))
          markTrendRefreshPersistenceFailed(attempt.platform, attempt.dataset);
      }
      throw error;
    } finally {
      for (const attempt of evidence) {
        attempt.completedAt = new Date().toISOString();
        if (
          !attempt.outcome.endsWith('failed') &&
          !(
            attempt.outcome === 'native_empty' &&
            attempt.reason === 'native_unavailable'
          )
        )
          attempt.lastSuccessfulRefreshAt = attempt.completedAt;
      }
      await persist?.(evidence);
    }
  });
}

export function recordTrendProviderOutcome(
  outcome: TrendRefreshOutcome,
  reason: TrendRefreshReason | null = null,
): void {
  const attempt = current.getStore();
  if (attempt) {
    attempt.outcome = outcome;
    attempt.reason = reason;
  }
}

export async function withTrendRefreshAttempt<T>(
  platform: string,
  dataset: TrendRefreshDataset,
  scope: TrendRefreshHealth['scope'],
  work: () => Promise<T>,
): Promise<T> {
  const attempt: TrendRefreshHealth = {
    completedAt: '',
    dataset,
    lastAttemptAt: new Date().toISOString(),
    lastSuccessfulRefreshAt: null,
    outcome:
      dataset === 'trends' || (dataset === 'videos' && platform === 'youtube')
        ? 'native_failed'
        : 'fallback_failed',
    platform,
    reason: 'provider_failed',
    scope,
  };
  return current.run(attempt, async () => {
    try {
      return await work();
    } finally {
      attempt.completedAt = new Date().toISOString();
      if (
        !attempt.outcome.endsWith('failed') &&
        !(
          attempt.outcome === 'native_empty' &&
          attempt.reason === 'native_unavailable'
        )
      ) {
        attempt.lastSuccessfulRefreshAt = attempt.completedAt;
      }
      if (!skipped.has(attempt)) attempts.getStore()?.push(attempt);
    }
  });
}

export function markTrendRefreshPersistenceFailed(
  platform: string,
  dataset: TrendRefreshDataset,
): void {
  const attempt = [...(attempts.getStore() ?? [])]
    .reverse()
    .find((value) => value.platform === platform && value.dataset === dataset);
  if (attempt) {
    attempt.outcome = attempt.outcome.startsWith('fallback')
      ? 'fallback_failed'
      : 'native_failed';
    attempt.reason = 'persistence_failed';
    attempt.lastSuccessfulRefreshAt = null;
  }
}

export function getTrendNativeFailureReason():
  | 'native_failed'
  | 'native_unavailable'
  | null {
  const reason = current.getStore()?.reason;
  return reason === 'native_failed' || reason === 'native_unavailable'
    ? reason
    : null;
}

export function skipTrendRefreshAttempt(): void {
  const attempt = current.getStore();
  if (attempt) skipped.add(attempt);
}

export function recordTrendRefreshFailure(reason: TrendRefreshReason): void {
  const attempt = current.getStore();
  if (attempt)
    recordTrendProviderOutcome(
      attempt.outcome.startsWith('fallback')
        ? 'fallback_failed'
        : 'native_failed',
      reason,
    );
}
