import type { AdsResearchItem, AdsResearchMetric } from '@genfeedai/interfaces';

export function formatMetric(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n/a';
  }

  if (value >= 1000) {
    return value.toLocaleString();
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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
