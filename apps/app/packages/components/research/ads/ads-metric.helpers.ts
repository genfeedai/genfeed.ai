import type {
  AdsResearchItem,
  AdsResearchLongevity,
  AdsResearchMetric,
  AdsResearchPlatform,
} from '@genfeedai/contracts/interfaces';

export function formatMetric(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n/a';
  }

  if (value >= 1000) {
    return value.toLocaleString();
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Render how long a competitor kept a creative on air. Returns `null` when the
 * archive published no run dates — an unscored ad reads as blank rather than
 * as a zero-day one.
 */
export function formatLongevity(
  longevity: AdsResearchLongevity | undefined,
): string | null {
  if (!longevity) {
    return null;
  }

  const days = `${longevity.daysLive}d`;

  return longevity.isStillRunning ? `${days} live` : `${days} ended`;
}

export function getMetricValue(
  item: AdsResearchItem,
  metric: AdsResearchMetric,
): number | undefined {
  switch (metric) {
    case 'ctr':
      return item.metrics.ctr;
    case 'roas':
      return item.metrics.roas;
    case 'conversions':
      return item.metrics.conversions;
    default:
      return item.metrics.performanceScore ?? item.metricValue;
  }
}

export function getMetricLabel(metric: AdsResearchMetric): string {
  switch (metric) {
    case 'ctr':
      return 'CTR';
    case 'roas':
      return 'ROAS';
    case 'conversions':
      return 'Conversions';
    case 'spendEfficiency':
      return 'Efficiency';
    default:
      return 'Score';
  }
}

export function getPlatformLabel(platform: AdsResearchPlatform): string {
  switch (platform) {
    case 'meta':
      return 'Meta';
    case 'tiktok':
      return 'TikTok';
    case 'x':
      return 'X';
    default:
      return 'Google';
  }
}
