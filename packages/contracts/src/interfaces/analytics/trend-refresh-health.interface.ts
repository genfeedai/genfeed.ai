export type TrendRefreshOutcome =
  | 'native_available'
  | 'native_empty'
  | 'native_failed'
  | 'fallback_available'
  | 'fallback_empty'
  | 'fallback_failed';

/** Fixed reason codes: provider error text and tenant identities never leave ingestion. */
export type TrendRefreshReason =
  | 'native_empty'
  | 'native_failed'
  | 'native_unavailable'
  | 'provider_failed'
  | 'persistence_failed';

export type TrendRefreshDataset = 'trends' | 'videos' | 'hashtags' | 'sounds';

export interface TrendRefreshHealth {
  dataset: TrendRefreshDataset;
  platform: string;
  scope: 'global' | 'scoped';
  lastAttemptAt: string;
  completedAt: string;
  lastSuccessfulRefreshAt: string | null;
  outcome: TrendRefreshOutcome;
  reason: TrendRefreshReason | null;
}
