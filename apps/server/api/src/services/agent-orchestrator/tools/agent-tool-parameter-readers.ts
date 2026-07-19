import type {
  AdsChannel,
  AdsResearchFilters,
  AdsResearchPlatform,
  AdsResearchSource,
} from '@genfeedai/interfaces/integrations/ads-research.interface';

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

export function readAdsSource(value: unknown): AdsResearchSource | undefined {
  return value === 'public' || value === 'my_accounts' || value === 'all'
    ? value
    : undefined;
}

export function readAdsPlatform(
  value: unknown,
): AdsResearchPlatform | undefined {
  return value === 'meta' || value === 'google' ? value : undefined;
}

export function readAdsChannel(value: unknown): AdsChannel | undefined {
  return value === 'all' ||
    value === 'search' ||
    value === 'display' ||
    value === 'youtube'
    ? value
    : undefined;
}

export function readAdsMetric(value: unknown): AdsResearchFilters['metric'] {
  return value === 'performanceScore' ||
    value === 'ctr' ||
    value === 'roas' ||
    value === 'conversions' ||
    value === 'spendEfficiency'
    ? value
    : undefined;
}

export function readAdsTimeframe(
  value: unknown,
): AdsResearchFilters['timeframe'] {
  return value === 'last_7_days' ||
    value === 'last_30_days' ||
    value === 'last_90_days' ||
    value === 'all_time'
    ? value
    : undefined;
}
