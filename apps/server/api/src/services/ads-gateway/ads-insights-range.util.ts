import type {
  AdsInsightsParams,
  AdsPlatform,
  UnifiedInsights,
} from '@genfeedai/interfaces';

export const ADS_INSIGHTS_PRESET_DAYS: Record<string, number> = {
  last_7d: 7,
  last_14d: 14,
  last_30d: 30,
  last_90d: 90,
  today: 0,
  yesterday: 1,
};

export type AdsInsightsDateRange = {
  endDate: string;
  startDate: string;
};

export type ResolveAdsInsightsDateRangeOptions = {
  defaultPreset?: string;
};

/**
 * Format an insights bound as YYYY-MM-DD via UTC ISO.
 * Callers keep local `setDate` arithmetic; this does not normalize timezones.
 */
export function formatAdsInsightsDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Resolve an ads insights window.
 *
 * `timeRange.since/until` wins. With no range, a preset (or `defaultPreset`)
 * is required: Google omits the default and returns undefined so the provider
 * can choose. TikTok passes `last_30d`. Unknown presets fall through to 30
 * days. End is now-1 day; start is now-days.
 */
export function resolveAdsInsightsDateRange(
  params: AdsInsightsParams | undefined,
  options: { defaultPreset: string },
): AdsInsightsDateRange;
export function resolveAdsInsightsDateRange(
  params?: AdsInsightsParams,
  options?: ResolveAdsInsightsDateRangeOptions,
): AdsInsightsDateRange | undefined;
export function resolveAdsInsightsDateRange(
  params?: AdsInsightsParams,
  options?: ResolveAdsInsightsDateRangeOptions,
): AdsInsightsDateRange | undefined {
  if (params?.timeRange) {
    return {
      endDate: params.timeRange.until,
      startDate: params.timeRange.since,
    };
  }

  const preset = params?.datePreset || options?.defaultPreset;
  if (!preset) {
    return undefined;
  }

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - 1);

  const days = ADS_INSIGHTS_PRESET_DAYS[preset] ?? 30;
  const start = new Date(now);
  start.setDate(start.getDate() - days);

  return {
    endDate: formatAdsInsightsDate(end),
    startDate: formatAdsInsightsDate(start),
  };
}

export function emptyUnifiedInsights(platform: AdsPlatform): UnifiedInsights {
  return {
    clicks: 0,
    cpc: 0,
    cpm: 0,
    ctr: 0,
    dateStart: '',
    dateStop: '',
    impressions: 0,
    platform,
    spend: 0,
  };
}
