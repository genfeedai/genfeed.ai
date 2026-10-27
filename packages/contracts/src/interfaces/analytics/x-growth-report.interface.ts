import type { TargetAnalyticsCollectionState } from '../../enums/scheduler.enum';
import type { PublicationInsightMetrics } from '../content/publication-insights.interface';

/** Both ends included: publications and snapshots from `from` to `to`. */
export interface IXGrowthPeriod {
  from: string;
  to: string;
}

/** The authorized account and brand the report is bound to. */
export interface IXGrowthScope {
  brandId: string;
  credentialId: string;
  handle: string | null;
  organizationId: string;
}

export type XActivityKind = 'post' | 'quote' | 'reply' | 'unknown';

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

/** Who approved a publication before it went out, as stored on the post. */
export interface IXActivityApproval {
  decision: string | null;
  /** The publish approval that released it, when one did. */
  publishApprovalExecutedAt: string | null;
  publishApprovalStatus: string | null;
  reviewedAt: string | null;
}

/** The post X returned for a publication that was sent. */
export interface IXActivitySendReceipt {
  externalId: string;
  publishedAt: string | null;
  url: string | null;
}

export interface IXActivityRow {
  approval: IXActivityApproval | null;
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
  /** Null when no post id came back from X: the report does not invent one. */
  sendReceipt: IXActivitySendReceipt | null;
  sampleUpdatedAt: string | null;
  text: string;
  url: string | null;
}

export interface IXActivitySummary {
  byKind: Record<XActivityKind, number>;
  /** Rows whose views were really observed; the total counts only these. */
  rowsWithObservedViews: number;
  rowsWithStaleMetrics: number;
  totalRows: number;
  /** Null when no row has observed views: never a zero. */
  totalViews: number | null;
}

export interface IXFollowerReset {
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
  resets: IXFollowerReset[];
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
export interface IXUnavailableEvidence {
  reason: string;
  state: 'unavailable';
}

export interface IXGrowthReport {
  activity: {
    /** More publications matched than the report reads. */
    isTruncated: boolean;
    rows: IXActivityRow[];
    summary: IXActivitySummary;
  };
  directConversions: IXUnavailableEvidence;
  generatedAt: string;
  growth: XFollowerGrowth;
  period: IXGrowthPeriod;
  profileTraffic: IXUnavailableEvidence;
  /** Changes with the account, brand or period: drop a result that differs. */
  scopeKey: string;
  scope: IXGrowthScope;
}
