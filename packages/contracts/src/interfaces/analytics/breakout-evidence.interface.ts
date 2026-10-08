import type { Platform } from '../../enums/platform.enum';
import type {
  LearningAvailability,
  LearningFormat,
} from './content-learning.interface';

export type BreakoutExposureMetric = 'views' | 'impressions';
export interface BreakoutExposureEvidence {
  availability: LearningAvailability;
  value: number | null;
  source: string;
  scope: 'organic' | 'aggregate' | 'unknown';
}
export interface BreakoutObservationScope {
  organizationId: string;
  brandId: string;
  credentialId: string;
  platform: Platform;
  format: LearningFormat;
}
/** Provider evidence only; these fields never confer customer authority. */
export interface BreakoutObservation extends BreakoutObservationScope {
  id: string;
  logicalPostId: string;
  sourceFingerprint: string;
  contentDigest: string;
  publishedAtMs: number;
  requestStartedAtMs: number;
  receivedAtMs: number;
  providerAsOfMs: number | null;
  exposures: Partial<Record<BreakoutExposureMetric, BreakoutExposureEvidence>>;
  isDeleted: boolean;
  isPinned: boolean | null;
  isPromoted: boolean | null;
  isResponse: boolean;
  sourceValid: boolean;
}
export interface BreakoutBaselineOptions {
  windowAgeMs: number;
  toleranceMs: number;
  windowSize: number;
  minimumSampleSize: number;
  breakoutThreshold: number;
}
export type BreakoutEvidenceExclusion =
  | 'foreign_scope'
  | 'source_post'
  | 'not_prior_post'
  | 'deleted'
  | 'pinned'
  | 'promoted'
  | 'response'
  | 'unverified_source'
  | 'invalid_collection'
  | 'future_observation'
  | 'incomparable_age'
  | 'unavailable_metric'
  | 'invalid_metric'
  | 'non_organic_metric'
  | 'different_metric_source'
  | 'different_time_basis'
  | 'duplicate_post'
  | 'outside_window';
export interface BreakoutBaselineInput {
  scope: Readonly<BreakoutObservationScope>;
  target: Readonly<BreakoutObservation>;
  observations: readonly Readonly<BreakoutObservation>[];
  metric: BreakoutExposureMetric;
  nowMs: number;
  options: Readonly<BreakoutBaselineOptions>;
  truncated: boolean;
}
export interface BreakoutBaselineContributor {
  observationId: string;
  logicalPostId: string;
  sourceFingerprint: string;
  value: number;
  ageMs: number;
  isPinnedUnknown: boolean;
  isPromotedUnknown: boolean;
}
export interface BreakoutBaselineEvaluation {
  version: 1;
  status:
    | 'breakout'
    | 'below_threshold'
    | 'insufficient_data'
    | 'zero_baseline'
    | 'invalid_target'
    | 'truncated';
  metric: BreakoutExposureMetric;
  source: string | null;
  timeBasis: 'provider_as_of' | 'collection_interval';
  targetObservationId: string;
  targetValue: number | null;
  median: number | null;
  ratio: number | null;
  sampleSize: number;
  options: BreakoutBaselineOptions;
  contributors: BreakoutBaselineContributor[];
  exclusions: Array<{
    observationId: string;
    reasons: BreakoutEvidenceExclusion[];
  }>;
}
