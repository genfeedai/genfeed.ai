export type AnalyticsQueryMetric =
  | 'comments'
  | 'engagement'
  | 'engagementRate'
  | 'likes'
  | 'posts'
  | 'saves'
  | 'shares'
  | 'views';

export type AnalyticsQueryFilterKey =
  | 'metric'
  | 'patternType'
  | 'platform'
  | 'postId'
  | 'query'
  | 'sort'
  | 'timeframe'
  | 'visibility';

export interface AnalyticsQueryDateRange {
  readonly endDate: string;
  readonly startDate: string;
}

export interface AnalyticsQuerySelectedResource {
  readonly id: string;
  readonly kind: 'brand' | 'platform' | 'post' | 'trend';
}

export interface AnalyticsQueryProvenance {
  readonly authority: 'server-hydrated';
  readonly source: 'genfeed-analytics-api' | 'genfeed-trends-api';
  readonly summaryAuthority: 'derivative';
}

/**
 * A bounded reference to the visible Analytics query. It deliberately carries
 * no metric values: clients and generated summaries must resolve authoritative
 * numbers through the scoped Analytics API.
 */
export interface AnalyticsQueryReference {
  readonly brandId?: string;
  readonly dateRange: AnalyticsQueryDateRange;
  readonly filters: Readonly<Partial<Record<AnalyticsQueryFilterKey, string>>>;
  readonly id: string;
  readonly kind: 'analytics-query';
  readonly metric?: AnalyticsQueryMetric;
  readonly organizationId: string;
  readonly provenance: AnalyticsQueryProvenance;
  readonly route: string;
  readonly selectedResource?: AnalyticsQuerySelectedResource;
  readonly version: 1;
}
