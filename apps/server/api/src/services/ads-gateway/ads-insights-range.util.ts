import type {
  AdsInsightsParams,
  AdsPlatform,
  UnifiedInsights,
} from '@genfeedai/contracts/interfaces';

export const ADS_INSIGHTS_PRESETS = [
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_30d',
  'last_90d',
] as const;

export type AdsInsightsPreset = (typeof ADS_INSIGHTS_PRESETS)[number];

export const ADS_INSIGHTS_PRESET_DAYS: Record<AdsInsightsPreset, number> = {
  last_7d: 7,
  last_14d: 14,
  last_30d: 30,
  last_90d: 90,
  today: 0,
  yesterday: 1,
};

const ADS_INSIGHTS_PRESET_SET: ReadonlySet<string> = new Set(
  ADS_INSIGHTS_PRESETS,
);

const STRICT_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const INVALID_ADS_INSIGHTS_DATE_RANGE_MESSAGE =
  'Insight date range is invalid. Provide one known datePreset (today, yesterday, last_7d, last_14d, last_30d, last_90d) or a complete since and until pair as YYYY-MM-DD.';

export type AdsInsightsDateRange = {
  endDate: string;
  startDate: string;
};

export type AdsInsightsDateQuery = {
  datePreset?: string;
  since?: string;
  until?: string;
};

export type AdsInsightsQueryParseResult =
  | { isValid: true; params: AdsInsightsParams }
  | { isValid: false; message: string };

export type ResolveAdsInsightsDateRangeOptions = {
  defaultPreset?: string;
  now?: Date;
};

/**
 * Format an insights bound as YYYY-MM-DD via UTC ISO.
 * Callers keep UTC `setUTCDate` arithmetic; this does not use local time.
 */
export function formatAdsInsightsDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isAdsInsightsPreset(value: string): value is AdsInsightsPreset {
  return ADS_INSIGHTS_PRESET_SET.has(value);
}

/**
 * Parse a strict `YYYY-MM-DD` calendar date in UTC.
 * Rejects unpadded, non-calendar, and JavaScript-rollover values.
 */
export function parseAdsInsightsCalendarDate(value: string): Date | undefined {
  const match = STRICT_CALENDAR_DATE.exec(value);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Inclusive UTC range for one known preset. `today` and `yesterday` are
 * one-day windows; `last_Nd` ends yesterday and spans N inclusive days.
 */
export function resolveAdsInsightsPresetRange(
  preset: AdsInsightsPreset,
  now: Date = new Date(),
): AdsInsightsDateRange {
  if (preset === 'today') {
    const day = formatAdsInsightsDate(now);
    return { endDate: day, startDate: day };
  }

  if (preset === 'yesterday') {
    const day = formatAdsInsightsDate(addUtcDays(now, -1));
    return { endDate: day, startDate: day };
  }

  const days = ADS_INSIGHTS_PRESET_DAYS[preset];
  const end = addUtcDays(now, -1);
  const start = addUtcDays(now, -days);

  return {
    endDate: formatAdsInsightsDate(end),
    startDate: formatAdsInsightsDate(start),
  };
}

/**
 * Gateway query contract: one known preset, a complete custom pair, or
 * neither. Mixed, partial, unknown, malformed, and reversed input is invalid.
 * Presets normalize to an inclusive `timeRange` so every adapter sees the
 * same logical days.
 */
export function parseAdsInsightsQuery(
  query: AdsInsightsDateQuery,
  now: Date = new Date(),
): AdsInsightsQueryParseResult {
  const datePreset = query.datePreset;
  const since = query.since;
  const until = query.until;
  const hasPreset = Boolean(datePreset);
  const hasSince = Boolean(since);
  const hasUntil = Boolean(until);

  if (!hasPreset && !hasSince && !hasUntil) {
    return { isValid: true, params: {} };
  }

  if (hasPreset && (hasSince || hasUntil)) {
    return {
      isValid: false,
      message: INVALID_ADS_INSIGHTS_DATE_RANGE_MESSAGE,
    };
  }

  if (hasPreset) {
    if (!datePreset || !isAdsInsightsPreset(datePreset)) {
      return {
        isValid: false,
        message: INVALID_ADS_INSIGHTS_DATE_RANGE_MESSAGE,
      };
    }

    const range = resolveAdsInsightsPresetRange(datePreset, now);
    return {
      isValid: true,
      params: { timeRange: { since: range.startDate, until: range.endDate } },
    };
  }

  if (hasSince !== hasUntil || !since || !until) {
    return {
      isValid: false,
      message: INVALID_ADS_INSIGHTS_DATE_RANGE_MESSAGE,
    };
  }

  const start = parseAdsInsightsCalendarDate(since);
  const end = parseAdsInsightsCalendarDate(until);
  if (!start || !end || start.getTime() > end.getTime()) {
    return {
      isValid: false,
      message: INVALID_ADS_INSIGHTS_DATE_RANGE_MESSAGE,
    };
  }

  return {
    isValid: true,
    params: {
      timeRange: {
        since: formatAdsInsightsDate(start),
        until: formatAdsInsightsDate(end),
      },
    },
  };
}

/**
 * Resolve an ads insights window for adapters.
 *
 * `timeRange.since/until` wins. With no range, a known preset (or a known
 * `defaultPreset`) is required: Google omits the default and returns undefined
 * so the provider can choose. TikTok passes `last_30d`. Unknown presets do
 * not fall through to 30 days. `today` and `yesterday` are one inclusive UTC
 * day; `last_Nd` ends yesterday.
 */
export function resolveAdsInsightsDateRange(
  params: AdsInsightsParams | undefined,
  options: { defaultPreset: string; now?: Date },
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

  const now = options?.now ?? new Date();
  const requestedPreset = params?.datePreset;
  if (requestedPreset) {
    if (!isAdsInsightsPreset(requestedPreset)) {
      return undefined;
    }
    return resolveAdsInsightsPresetRange(requestedPreset, now);
  }

  const defaultPreset = options?.defaultPreset;
  if (!defaultPreset || !isAdsInsightsPreset(defaultPreset)) {
    return undefined;
  }

  return resolveAdsInsightsPresetRange(defaultPreset, now);
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
