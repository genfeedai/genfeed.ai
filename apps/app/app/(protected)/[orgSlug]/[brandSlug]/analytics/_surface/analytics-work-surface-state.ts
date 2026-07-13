import type {
  AnalyticsQueryDateRange,
  AnalyticsQueryFilterKey,
  AnalyticsQueryFilters,
  AnalyticsQueryMetric,
  AnalyticsQueryReference,
  AnalyticsQuerySelectedResource,
} from '@genfeedai/interfaces';
import type { DateRange } from '@genfeedai/interfaces/utils/date.interface';
import { getDefaultDateRange } from '@helpers/utils/date-range.util';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PLATFORM_PATTERN = /^[a-z0-9_-]{1,32}$/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const MAX_ANALYTICS_RANGE_DAYS = 366;

export const ANALYTICS_DATE_SEARCH_KEYS = Object.freeze({
  endDate: 'endDate',
  startDate: 'startDate',
});

export const ANALYTICS_FILTER_SEARCH_KEYS = Object.freeze({
  patternType: 'patternType',
  metric: 'metric',
  platform: 'platform',
  postId: 'postId',
  query: 'q',
  sort: 'sort',
  timeframe: 'timeframe',
  visibility: 'visibility',
} satisfies Record<AnalyticsQueryFilterKey, string>);

export const ANALYTICS_METRIC_DEFINITIONS = Object.freeze({
  comments: 'Comments recorded across the selected published content.',
  engagement: 'Total recorded interactions across the selected content.',
  engagementRate:
    'Recorded interactions divided by the applicable audience or view denominator.',
  likes: 'Likes recorded across the selected published content.',
  posts: 'Published posts included in the visible scoped query.',
  saves: 'Saves recorded across the selected published content.',
  shares: 'Shares recorded across the selected published content.',
  views: 'Platform-reported views for the selected published content.',
} satisfies Record<AnalyticsQueryMetric, string>);

export interface AnalyticsSurfaceDescriptor {
  readonly cacheMinutes: number;
  readonly defaultFilters?: AnalyticsQueryFilters;
  readonly exportKind?: 'published-posts';
  readonly filterKeys: readonly AnalyticsQueryFilterKey[];
  readonly label: string;
  readonly maxVisibleResults: number;
  readonly metrics: readonly AnalyticsQueryMetric[];
  readonly source: AnalyticsQueryReference['provenance']['source'];
}

export interface RestoredAnalyticsSurfaceState {
  readonly canonicalSearchParams: URLSearchParams;
  readonly dateRange: DateRange;
  readonly dateRangeKeys: AnalyticsQueryDateRange;
  readonly descriptor: AnalyticsSurfaceDescriptor;
  readonly filters: AnalyticsQueryFilters;
  readonly isCanonical: boolean;
  readonly normalizedRoute: string;
  readonly selectedResource?: AnalyticsQuerySelectedResource;
}

const DEFAULT_DESCRIPTOR = Object.freeze({
  cacheMinutes: 15,
  filterKeys: [],
  label: 'Analytics',
  maxVisibleResults: 100,
  metrics: ['views', 'engagement', 'engagementRate', 'posts'],
  source: 'genfeed-analytics-api',
} as const satisfies AnalyticsSurfaceDescriptor);

function normalizeAnalyticsRoute(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const analyticsIndex = parts.indexOf('analytics');
  if (analyticsIndex === -1) {
    return '/analytics/overview';
  }
  return `/${parts.slice(analyticsIndex).join('/')}`;
}

function resolveDescriptor(route: string): AnalyticsSurfaceDescriptor {
  if (route === '/analytics/overview') {
    return { ...DEFAULT_DESCRIPTOR, exportKind: 'published-posts' };
  }
  if (route === '/analytics/posts') {
    return {
      cacheMinutes: 15,
      defaultFilters: { metric: 'views' },
      exportKind: 'published-posts',
      filterKeys: ['metric', 'platform', 'postId', 'query'],
      label: 'Post analytics',
      maxVisibleResults: 50,
      metrics: ['views', 'engagement', 'likes'],
      source: 'genfeed-analytics-api',
    };
  }
  if (route === '/analytics/brands') {
    return {
      cacheMinutes: 15,
      defaultFilters: { sort: 'engagement' },
      filterKeys: ['query', 'sort'],
      label: 'Brand analytics',
      maxVisibleResults: 100,
      metrics: ['engagement', 'views', 'posts', 'engagementRate'],
      source: 'genfeed-analytics-api',
    };
  }
  if (route.startsWith('/analytics/brands/')) {
    return {
      cacheMinutes: 15,
      filterKeys: [],
      label: 'Brand analytics',
      maxVisibleResults: 100,
      metrics: ['engagement', 'views', 'posts', 'engagementRate'],
      source: 'genfeed-analytics-api',
    };
  }
  if (route === '/analytics/hooks') {
    return {
      cacheMinutes: 15,
      filterKeys: [],
      label: 'Hook performance',
      maxVisibleResults: 100,
      metrics: ['views', 'likes', 'comments', 'shares', 'engagementRate'],
      source: 'genfeed-analytics-api',
    };
  }
  if (route === '/analytics/trends') {
    return {
      cacheMinutes: 30,
      defaultFilters: { timeframe: '72h' },
      filterKeys: ['platform', 'timeframe'],
      label: 'Analytics trends',
      maxVisibleResults: 12,
      metrics: ['views', 'engagementRate'],
      source: 'genfeed-trends-api',
    };
  }
  if (route.startsWith('/analytics/trends/')) {
    return {
      cacheMinutes: 30,
      filterKeys: [],
      label: 'Trend analytics',
      maxVisibleResults: 50,
      metrics: ['views', 'engagementRate'],
      source: 'genfeed-trends-api',
    };
  }
  if (route === '/analytics/performance-lab') {
    return {
      cacheMinutes: 15,
      filterKeys: ['patternType', 'platform', 'visibility'],
      label: 'Performance lab',
      maxVisibleResults: 100,
      metrics: ['engagement', 'engagementRate', 'views'],
      source: 'genfeed-analytics-api',
    };
  }
  if (route === '/analytics/insights') {
    return {
      cacheMinutes: 15,
      filterKeys: [],
      label: 'Analytics insights',
      maxVisibleResults: 100,
      metrics: ['engagementRate', 'views'],
      source: 'genfeed-analytics-api',
    };
  }
  return DEFAULT_DESCRIPTOR;
}

function parseDateKey(value: string | null): Date | null {
  if (!value || !DATE_KEY_PATTERN.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function isValidDateRange(
  startDate: Date,
  endDate: Date,
  latestAllowedDate: Date,
): boolean {
  const durationDays =
    Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  return (
    durationDays >= 1 &&
    durationDays <= MAX_ANALYTICS_RANGE_DAYS &&
    endDate.getTime() <= latestAllowedDate.getTime()
  );
}

function normalizeFilterValue(
  key: AnalyticsQueryFilterKey,
  value: string | null,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  if (key === 'platform') {
    return PLATFORM_PATTERN.test(normalized) ? normalized : undefined;
  }
  if (key === 'postId') {
    return RESOURCE_ID_PATTERN.test(normalized) ? normalized : undefined;
  }
  if (key === 'patternType') {
    return [
      'caption_formula',
      'content_structure',
      'cta_formula',
      'hook_formula',
      'visual_style',
    ].includes(normalized)
      ? normalized
      : undefined;
  }
  if (key === 'metric' || key === 'sort') {
    return Object.hasOwn(ANALYTICS_METRIC_DEFINITIONS, normalized)
      ? normalized
      : undefined;
  }
  if (key === 'timeframe') {
    return ['24h', '72h', '7d', '30d', '90d'].includes(normalized)
      ? normalized
      : undefined;
  }
  if (key === 'visibility') {
    return ['private', 'public'].includes(normalized) ? normalized : undefined;
  }
  const containsControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  return normalized.length <= 120 && !containsControlCharacter
    ? normalized
    : undefined;
}

function resolveSelectedResource(
  route: string,
  filters: AnalyticsQueryFilters,
): AnalyticsQuerySelectedResource | undefined {
  if (filters.postId) {
    return { id: filters.postId, kind: 'post' };
  }
  const brandPlatformMatch = route.match(
    /^\/analytics\/brands\/([^/]+)\/platforms\/([^/]+)$/,
  );
  if (brandPlatformMatch) {
    return { id: brandPlatformMatch[2], kind: 'platform' };
  }
  const brandMatch = route.match(/^\/analytics\/brands\/([^/]+)$/);
  if (brandMatch) {
    return { id: brandMatch[1], kind: 'brand' };
  }
  const trendMatch = route.match(/^\/analytics\/trends\/detail\/([^/]+)$/);
  if (trendMatch) {
    return { id: trendMatch[1], kind: 'trend' };
  }
  const trendPlatformMatch = route.match(
    /^\/analytics\/trends\/platforms\/([^/]+)$/,
  );
  if (trendPlatformMatch) {
    return { id: trendPlatformMatch[1], kind: 'platform' };
  }
  return undefined;
}

export function restoreAnalyticsSurfaceState({
  pathname,
  searchParams,
}: {
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
}): RestoredAnalyticsSurfaceState {
  const canonicalSearchParams = new URLSearchParams(searchParams);
  const normalizedRoute = normalizeAnalyticsRoute(pathname);
  const descriptor = resolveDescriptor(normalizedRoute);
  const defaults = getDefaultDateRange();
  const latestAllowedDate = parseDateKey(defaults.endDate) as Date;
  const requestedStartKey = searchParams.get(
    ANALYTICS_DATE_SEARCH_KEYS.startDate,
  );
  const requestedEndKey = searchParams.get(ANALYTICS_DATE_SEARCH_KEYS.endDate);
  const requestedStartDate = parseDateKey(requestedStartKey);
  const requestedEndDate = parseDateKey(requestedEndKey);
  const hasValidRange = Boolean(
    requestedStartDate &&
      requestedEndDate &&
      isValidDateRange(requestedStartDate, requestedEndDate, latestAllowedDate),
  );
  const startDateKey = hasValidRange
    ? (requestedStartKey as string)
    : defaults.startDate;
  const endDateKey = hasValidRange
    ? (requestedEndKey as string)
    : defaults.endDate;

  canonicalSearchParams.set(ANALYTICS_DATE_SEARCH_KEYS.startDate, startDateKey);
  canonicalSearchParams.set(ANALYTICS_DATE_SEARCH_KEYS.endDate, endDateKey);

  const filters: Partial<Record<AnalyticsQueryFilterKey, string>> = {
    ...descriptor.defaultFilters,
  };
  for (const [filterKey, searchKey] of Object.entries(
    ANALYTICS_FILTER_SEARCH_KEYS,
  ) as Array<[AnalyticsQueryFilterKey, string]>) {
    const requestedValue = searchParams.get(searchKey);
    if (!descriptor.filterKeys.includes(filterKey)) {
      if (requestedValue !== null) {
        canonicalSearchParams.delete(searchKey);
      }
      continue;
    }
    const normalizedValue = normalizeFilterValue(filterKey, requestedValue);
    if (normalizedValue) {
      filters[filterKey] = normalizedValue;
      canonicalSearchParams.set(searchKey, normalizedValue);
    } else if (requestedValue !== null) {
      canonicalSearchParams.delete(searchKey);
    }
  }

  for (const [filterKey, defaultValue] of Object.entries(
    descriptor.defaultFilters ?? {},
  ) as Array<[AnalyticsQueryFilterKey, string]>) {
    canonicalSearchParams.set(
      ANALYTICS_FILTER_SEARCH_KEYS[filterKey],
      filters[filterKey] ?? defaultValue,
    );
  }

  const dateRange = {
    endDate: parseDateKey(endDateKey),
    startDate: parseDateKey(startDateKey),
  };
  const selectedResource = resolveSelectedResource(normalizedRoute, filters);

  return {
    canonicalSearchParams,
    dateRange,
    dateRangeKeys: { endDate: endDateKey, startDate: startDateKey },
    descriptor,
    filters,
    isCanonical: canonicalSearchParams.toString() === searchParams.toString(),
    normalizedRoute,
    ...(selectedResource ? { selectedResource } : {}),
  };
}

function hashQueryReference(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildAnalyticsQueryReference({
  brandId,
  dateRange,
  descriptor,
  filters,
  normalizedRoute,
  organizationId,
  selectedResource,
}: {
  readonly brandId?: string;
  readonly dateRange: AnalyticsQueryDateRange;
  readonly descriptor: AnalyticsSurfaceDescriptor;
  readonly filters: AnalyticsQueryFilters;
  readonly normalizedRoute: string;
  readonly organizationId: string;
  readonly selectedResource?: AnalyticsQuerySelectedResource;
}): AnalyticsQueryReference {
  const metricCandidate = filters.metric ?? filters.sort;
  const metric = metricCandidate
    ? (metricCandidate as AnalyticsQueryMetric)
    : descriptor.metrics[0];
  const identity = JSON.stringify({
    brandId,
    dateRange,
    filters,
    normalizedRoute,
    organizationId,
    selectedResource,
  });

  return {
    ...(brandId ? { brandId } : {}),
    dateRange,
    filters,
    id: `analytics-query-${hashQueryReference(identity)}`,
    kind: 'analytics-query',
    ...(metric ? { metric } : {}),
    organizationId,
    provenance: {
      authority: 'server-hydrated',
      source: descriptor.source,
      summaryAuthority: 'derivative',
    },
    route: normalizedRoute,
    ...(selectedResource ? { selectedResource } : {}),
    version: 1,
  };
}

export function buildCanonicalAnalyticsHref(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  const canonicalParams = new URLSearchParams(searchParams);
  canonicalParams.delete('overlay');
  canonicalParams.delete('overlayRef');
  canonicalParams.delete('thread');
  const query = canonicalParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
