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

export function getTrendNativeFailureReason(): TrendRefreshReason | null {
  const attempt = current.getStore();
  return (attempt?.outcome === 'native_failed' &&
    attempt.reason !== 'provider_failed') ||
    attempt?.reason === 'native_unavailable'
    ? attempt.reason
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

/** Classify provider failures without persisting token-bearing error messages. */
export function classifyTrendProviderError(error: unknown): TrendRefreshReason {
  const record =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : {};
  const response =
    record.response && typeof record.response === 'object'
      ? (record.response as Record<string, unknown>)
      : {};
  const data =
    response.data && typeof response.data === 'object'
      ? (response.data as Record<string, unknown>)
      : {};
  const providerError =
    data.error && typeof data.error === 'object'
      ? (data.error as Record<string, unknown>)
      : {};
  const status = Number(
    response.status ?? record.status ?? record.statusCode ?? record.code,
  );
  const message = [
    error instanceof Error ? error.message : '',
    providerError.type,
    providerError.message,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  if (
    status === 402 ||
    /not-enough-usage|usage limit|budget|payment required|credits depleted/i.test(
      message,
    )
  )
    return 'budget_exhausted';
  if (
    status === 401 ||
    status === 89 ||
    /invalid.grant|invalid.*token|expired.*token/i.test(message)
  )
    return 'authentication_required';
  if (status === 403) return 'access_required';
  if (status === 429) return 'rate_limited';
  return 'provider_failed';
}
