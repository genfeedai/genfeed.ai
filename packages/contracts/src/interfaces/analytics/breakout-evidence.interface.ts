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
export interface BreakoutPublicationSourceInput
  extends Omit<BreakoutObservationScope, 'format'> {
  postId: string;
  externalId: string;
}
export interface BreakoutPublicationSourceV1
  extends BreakoutPublicationSourceInput {
  version: 1;
  format: LearningFormat;
  publishedAt: string;
  contentDigest: string;
  publicationFingerprint: string;
  logicalPostId: string;
  isResponse: boolean;
}
export interface BreakoutCollectionContext {
  source: BreakoutPublicationSourceV1;
  sourceAttemptId: string;
  requestStartedAt: Date;
  receivedAt: Date;
}
export interface BreakoutCaptureInput extends BreakoutCollectionContext {
  providerAsOf?: Date | null;
  exposures: Partial<Record<BreakoutExposureMetric, BreakoutExposureEvidence>>;
  isPinned: boolean | null;
  isPromoted: boolean | null;
}
export type BreakoutCaptureResult =
  | { status: 'captured' | 'replayed'; observationId: string }
  | { status: 'invalid_collection' | 'source_changed' | 'attempt_conflict' };
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
/** Internal provider-evidence read; callers must separately authorize product access. */
export interface BreakoutBaselineReadInput extends BreakoutObservationScope {
  targetObservationId: string;
  metric: BreakoutExposureMetric;
  options: BreakoutBaselineOptions;
  nowMs: number;
}
export type BreakoutBaselineReceiptResult =
  | {
      status: 'recorded' | 'replayed';
      receiptId: string;
      evidenceFingerprint: string;
      evaluation: BreakoutBaselineEvaluation;
    }
  | {
      status:
        | 'missing_target'
        | 'source_changed'
        | 'invalid_observation'
        | 'receipt_conflict';
    };
export interface BreakoutOutputPlanSlot {
  ordinal: number;
  kind: 'follow_up' | 'quote';
  format: LearningFormat;
}
export interface BreakoutOutputPlanInput
  extends Omit<BreakoutObservationScope, 'format'> {
  responseId: string;
  slots: BreakoutOutputPlanSlot[];
}
export type BreakoutResponseRegistrationResult =
  | {
      status: 'registered' | 'replayed';
      responseId: string;
      triggerReceiptId: string;
    }
  | {
      status: 'evidence_held';
      reason: BreakoutBaselineEvaluation['status'] | 'response_source';
    }
  | Exclude<BreakoutBaselineReceiptResult, { receiptId: string }>
  | { status: 'identity_conflict' };
export type BreakoutOutputPlanResult =
  | {
      status: 'reserved' | 'replayed';
      outputIds: string[];
      generationKeys: string[];
    }
  | { status: 'missing_response' | 'invalid_plan' | 'plan_conflict' };
