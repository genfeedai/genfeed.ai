export interface OutlierBaselineScope {
  organizationId: string;
  accountId: string;
  platform: string;
  contentType: string;
}

export interface OutlierBaselinePostInput extends OutlierBaselineScope {
  id: string;
  publishedAtMs: number;
  views: number | null;
  isDeleted: boolean;
  isPinned: boolean | null;
  isPromoted: boolean | null;
}

export interface OutlierBaselineOptions {
  windowSize: number;
  minimumSampleSize: number;
  maturityMs: number;
  outlierThreshold: number;
  breakoutThreshold: number;
}

export type OutlierBaselineExclusionReason =
  | 'soft_deleted'
  | 'pinned'
  | 'promoted'
  | 'immature'
  | 'invalid_publish_date'
  | 'invalid_views'
  | 'outside_window';

export interface OutlierBaselinePostResult {
  id: string;
  isContributor: boolean;
  isPinnedUnknown: boolean;
  isPromotedUnknown: boolean;
  reasons: OutlierBaselineExclusionReason[];
  ratio: number | null;
  tier: 'outlier' | 'breakout' | null;
}

export interface OutlierBaselineInput {
  scope: Readonly<OutlierBaselineScope>;
  nowMs: number;
  posts: readonly Readonly<OutlierBaselinePostInput>[];
  options?: Partial<OutlierBaselineOptions>;
}

export interface OutlierBaselineResult {
  scope: OutlierBaselineScope;
  computedAt: string;
  options: OutlierBaselineOptions;
  contributorIds: string[];
  sampleSize: number;
  median: number | null;
  status: 'insufficient_data' | 'zero_baseline' | 'ready';
  /** Preserves input order; contributorIds uses newest-first order. */
  posts: OutlierBaselinePostResult[];
}
