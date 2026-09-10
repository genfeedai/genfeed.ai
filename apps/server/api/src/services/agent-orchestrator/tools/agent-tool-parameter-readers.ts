import {
  type AdsChannel,
  type AdsResearchFilters,
  type AdsResearchPlatform,
  type AdsResearchSource,
  isAdsChannel,
  isAdsPlatform,
} from '@genfeedai/contracts/interfaces';

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
  // Ads research uses product-channel names, not CredentialPlatform values.
  return typeof value === 'string' && isAdsPlatform(value) ? value : undefined;
}

export function readAdsChannel(value: unknown): AdsChannel | undefined {
  return typeof value === 'string' && isAdsChannel(value) ? value : undefined;
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
