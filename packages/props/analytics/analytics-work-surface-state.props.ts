import type {
  AnalyticsQueryDateRange,
  AnalyticsQueryFilterKey,
  AnalyticsQueryFilters,
  AnalyticsQueryMetric,
  AnalyticsQueryReference,
  AnalyticsQuerySelectedResource,
} from '@genfeedai/contracts/interfaces';

import type { DateRange } from '@genfeedai/contracts/interfaces/utils/date.interface';

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
  /**
   * The brand id named by the route itself (`/analytics/brands/:id` and its
   * `/platforms/:platform` child), independent of `selectedResource` — which
   * narrows to the platform on the child route and would otherwise drop the
   * enclosing brand id.
   */
  readonly routeBrandId?: string;
  readonly selectedResource?: AnalyticsQuerySelectedResource;
}
