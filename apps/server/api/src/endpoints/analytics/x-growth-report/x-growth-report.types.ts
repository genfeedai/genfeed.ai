import type { TargetAnalyticsCollectionState } from '@genfeedai/contracts';
import type { PublicationInsightMetrics } from '@genfeedai/contracts/interfaces/content/publication-insights.interface';

/** Both ends included: publications and snapshots from `from` to `to`. */
export interface XGrowthPeriod {
  from: string;
  to: string;
}

/** The authorized account and brand the report is bound to. */
export interface XGrowthScope {
  brandId: string;
  credentialId: string;
  handle: string | null;
  organizationId: string;
}

export type XActivityKind = 'post' | 'reply' | 'unknown';

/**
 * observed: every metric was read. partial: some were. pending: collection has
 * not produced a sample yet. unavailable: the platform or account cannot give
 * one, or collection failed; the row says why.
 */
export type XActivityMetricState =
  | 'observed'
  | 'partial'
  | 'pending'
  | 'unavailable';

export interface XActivityRow {
  collectionMessage: string | null;
  collectionState: TargetAnalyticsCollectionState;
  externalId: string | null;
  /** The newest sample is older than the freshness window. */
  isStale: boolean;
  kind: XActivityKind;
  metricState: XActivityMetricState;
  metrics: PublicationInsightMetrics | null;
  postId: string;
  publishedAt: string | null;
  sampleUpdatedAt: string | null;
  text: string;
  url: string | null;
}

export interface XActivitySummary {
  byKind: Record<XActivityKind, number>;
  /** Rows whose views were really observed; the total counts only these. */
  rowsWithObservedViews: number;
  rowsWithStaleMetrics: number;
  totalRows: number;
  /** Null when no row has observed views: never a zero. */
  totalViews: number | null;
}

export interface XFollowerReset {
  date: string;
  from: number;
  to: number;
}

export type XFollowerGrowthReason =
  | 'low_coverage'
  | 'no_snapshots'
  | 'reset_leaves_one_snapshot'
  | 'single_snapshot';

interface XFollowerCoverage {
  /** Days with an observed follower count inside the period. */
  observedDays: number;
  periodDays: number;
  resets: XFollowerReset[];
}

export type XFollowerGrowth =
  | (XFollowerCoverage & {
      /** An account-level change over time: it is not caused by any one post. */
      relationship: 'correlation';
      delta: number;
      endDate: string;
      endFollowers: number;
      maxGapDays: number;
      startDate: string;
      startFollowers: number;
      state: 'observed';
    })
  | (XFollowerCoverage & {
      reason: XFollowerGrowthReason;
      state: 'insufficient';
    });

/** A measure this report cannot give yet, and why. */
export interface XUnavailableEvidence {
  reason: string;
  state: 'unavailable';
}

export interface XGrowthReport {
  activity: {
    /** More publications matched than the report reads. */
    isTruncated: boolean;
    rows: XActivityRow[];
    summary: XActivitySummary;
  };
  directConversions: XUnavailableEvidence;
  generatedAt: string;
  growth: XFollowerGrowth;
  period: XGrowthPeriod;
  profileTraffic: XUnavailableEvidence;
  /** Changes with the account, brand or period: drop a result that differs. */
  scopeKey: string;
  scope: XGrowthScope;
}

export interface XFollowerSnapshotInput {
  date: Date;
  followers: number | null;
  metricAvailability: unknown;
}
