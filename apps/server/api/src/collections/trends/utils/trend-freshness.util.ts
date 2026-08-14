import type { TrendPromptReferenceFreshnessStatus } from '@api/collections/trends/interfaces/trend.interfaces';

export const DEFAULT_PROMPT_REFERENCE_FRESHNESS_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveFreshnessWindowDays(
  freshnessWindowDays?: number,
): number {
  return freshnessWindowDays ?? DEFAULT_PROMPT_REFERENCE_FRESHNESS_DAYS;
}

export function getTrendFreshnessStatus(
  lastSeenAt: string,
  generatedAt: Date,
  freshnessWindowDays: number,
): TrendPromptReferenceFreshnessStatus {
  const lastSeenMs = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenMs)) {
    return 'expired';
  }

  const ageMs = generatedAt.getTime() - lastSeenMs;
  const freshnessWindowMs = freshnessWindowDays * MS_PER_DAY;
  if (ageMs <= freshnessWindowMs) {
    return 'fresh';
  }

  return ageMs <= freshnessWindowMs * 2 ? 'stale' : 'expired';
}

export function optionalSourceFields<T extends object>(
  source: T,
  text?: string,
  title?: string,
): T & { text?: string; title?: string } {
  return {
    ...source,
    ...(text ? { text } : {}),
    ...(title ? { title } : {}),
  };
}
