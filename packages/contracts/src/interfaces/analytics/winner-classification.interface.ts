import type { WinnerSignal } from '../../types/winner-signal';
import type {
  OutlierBaselineOptions,
  OutlierBaselinePostInput,
  OutlierBaselineResult,
  OutlierBaselineScope,
} from './outlier-baseline.interface';

export type { WinnerSignal } from '../../types/winner-signal';

/**
 * One own post's measurements. A signal that was not observed is `null` and
 * can never qualify the post; engagement rate is `null` without observed views.
 */
export interface WinnerClassificationPostInput
  extends Omit<OutlierBaselinePostInput, 'views'> {
  metrics: Readonly<Partial<Record<WinnerSignal, number | null>>>;
}

export interface WinnerClassificationInput {
  scope: Readonly<OutlierBaselineScope>;
  nowMs: number;
  posts: readonly Readonly<WinnerClassificationPostInput>[];
  options?: Partial<OutlierBaselineOptions>;
}

/** Why a post won: the signal, its value and the baseline it beat. */
export interface WinnerSignalEvidence {
  signal: WinnerSignal;
  value: number;
  /** Median of the signal over the account's recent mature posts. */
  baseline: number;
  ratio: number;
  sampleSize: number;
  tier: 'outlier' | 'breakout';
}

export interface WinnerSignalBaseline {
  signal: WinnerSignal;
  median: number | null;
  sampleSize: number;
  status: OutlierBaselineResult['status'];
}

export interface WinnerClassificationPostResult {
  id: string;
  isWinner: boolean;
  /** Qualifying signals, strongest ratio first. Empty when not a winner. */
  evidence: WinnerSignalEvidence[];
}

export interface WinnerClassificationResult {
  scope: OutlierBaselineScope;
  computedAt: string;
  options: OutlierBaselineOptions;
  baselines: WinnerSignalBaseline[];
  /** Preserves input order. */
  posts: WinnerClassificationPostResult[];
}

/** #5502 an own post that won, as `GET /analytics/winners` returns it. */
export interface IWinnerPost {
  postId: string;
  label: string | null;
  description: string | null;
  platform: string;
  contentType: string;
  publishedAt: string | null;
  totalViews: number | null;
  totalLikes: number | null;
  totalComments: number | null;
  engagementRate: number | null;
  /** Qualifying signals, strongest ratio first. */
  evidence: WinnerSignalEvidence[];
}

export interface WinnerPostsQuery {
  organizationId: string;
  brandId: string;
  /** Only posts published in this window are returned; baselines use all history. */
  publishedFrom?: Date;
  publishedTo?: Date;
  platform?: string;
  limit?: number;
}
