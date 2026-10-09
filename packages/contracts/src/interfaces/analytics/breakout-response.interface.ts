import type {
  BreakoutExposureScope,
  BreakoutObservationScope,
  BreakoutOutputPlanResult,
  BreakoutOutputPlanSlot,
  BreakoutPublicationSource,
} from './breakout-evidence.interface';
import type { LearningFormat } from './content-learning.interface';

/** Estimates for planning only; live debit/admission must use current server accounting. */
export interface BreakoutFormatCostEstimate {
  generationCredits: number | null;
  qualityCredits: number | null;
}
export interface BreakoutKnownFormatCostEstimate
  extends BreakoutFormatCostEstimate {
  generationCredits: number;
  qualityCredits: number;
}
export interface BreakoutPlanningBudget {
  remainingDailyCredits: number | null;
  remainingWeeklyCredits: number | null;
  remainingMonthlyCredits: number | null;
  availableOrganizationCredits: number | null;
  remainingPlatformCredits: number | null;
  remainingPacingCredits: number | null;
  /** Undefined means no configured cap. Null means a configured cap is unreadable. */
  remainingFormatCredits: Partial<Record<LearningFormat, number | null>>;
}
export interface BreakoutCapacityInput {
  source: Readonly<BreakoutPublicationSource>;
  requestedTotalOutputs: number;
  remainingPublicationSlots: number | null;
  budget: Readonly<BreakoutPlanningBudget>;
  supportedFormats: readonly LearningFormat[];
  costsByFormat: Readonly<
    Partial<Record<LearningFormat, Readonly<BreakoutFormatCostEstimate>>>
  >;
}
export interface BreakoutEstimatedOutputSlot extends BreakoutOutputPlanSlot {
  generationCredits: number;
  qualityCredits: number;
  estimatedCredits: number;
  quoteExternalId: string | null;
}
export type BreakoutCapacityLimit =
  | 'quota_unavailable'
  | 'quota_exhausted'
  | 'budget_unavailable'
  | 'budget_exhausted'
  | 'format_cap_exhausted'
  | 'cost_unavailable'
  | 'unsupported_format'
  | 'quote_unsupported'
  | 'response_source';
export interface BreakoutCapacityPlan {
  version: 1;
  status: 'planned' | 'held';
  requestedTotalOutputs: number;
  selectedTotalOutputs: number;
  slots: BreakoutEstimatedOutputSlot[];
  estimatedCredits: number;
  limits: BreakoutCapacityLimit[];
}
export interface BreakoutCapacityReservationInput
  extends BreakoutCapacityInput {
  responseId: string;
  /** Internal server clock for admission, never a customer-supplied authority. */
  nowMs?: number;
}
export interface BreakoutLiveCapacityInput
  extends Omit<BreakoutObservationScope, 'format'> {
  strategyId: string;
  nowMs: number;
}
export type BreakoutLiveCapacitySnapshot =
  | {
      status: 'available';
      capturedAt: string;
      strategyId: string;
      walletVersion: number;
      budget: BreakoutPlanningBudget;
      remainingPublicationSlots: number | null;
      capUsageBasis:
        | 'configured_cap_usage_unavailable'
        | 'monthly_ledger_and_reservations';
      cadenceTruncated: boolean;
    }
  | {
      status: 'held';
      reason:
        | 'missing_strategy'
        | 'account_unavailable'
        | 'wallet_unavailable'
        | 'ledger_usage_unavailable'
        | 'policy_unreadable';
    };
export interface BreakoutLiveCapacityReservationInput
  extends Omit<
    BreakoutCapacityReservationInput,
    'budget' | 'remainingPublicationSlots'
  > {
  strategyId: string;
  nowMs: number;
}
export type BreakoutLiveCapacityReservationResult =
  | BreakoutCapacityReservationResult
  | Extract<BreakoutLiveCapacitySnapshot, { status: 'held' }>;
export type BreakoutCapacityReservationResult =
  | (Extract<BreakoutOutputPlanResult, { outputIds: string[] }> & {
      /** Replay does not fabricate the original cost estimate. */
      estimate: BreakoutCapacityPlan | null;
    })
  | Exclude<BreakoutOutputPlanResult, { outputIds: string[] }>
  | { status: 'source_changed' }
  | { status: 'growth_held'; reason: BreakoutGrowthHeldReason }
  | { status: 'capacity_held'; estimate: BreakoutCapacityPlan };

export type BreakoutGrowthHeldReason =
  | 'growth_evidence_unavailable'
  | 'growth_evidence_stale'
  | 'growth_measurements_incomparable'
  | 'growth_faded';
export type BreakoutGrowthResult =
  | { status: 'held'; reason: BreakoutGrowthHeldReason }
  | {
      status: 'growing';
      observationIds: string[];
      measuredAt: string;
      increment: number;
      ratePerHour: number;
      resumed: boolean;
    };

export interface BreakoutOutputRecoveryInput
  extends Omit<BreakoutObservationScope, 'format'> {
  responseId: string;
  outputId: string;
}
export interface BreakoutResponseView {
  id: string;
  organizationId: string;
  brandId: string;
  credentialId: string;
  platform: string;
  state: string;
  detectedAt: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: false;
  source: {
    kind: 'post' | 'native_source_post' | 'unavailable';
    id: string | null;
    externalId: string;
    logicalPostId: string;
    format: string | null;
    publishedAt: string | null;
    status: 'current' | 'changed_or_unavailable';
  };
  trigger: {
    receiptId: string;
    metric: string;
    evaluatedAt: string;
    ratio: number | null;
    median: number | null;
    sampleSize: number;
    targetValue: number | null;
    metricSource: string | null;
    /** Null denotes a legacy receipt without retained provenance, never organic. */
    exposureScope: BreakoutExposureScope | null;
    timeBasis: 'provider_as_of' | 'collection_interval';
  } | null;
  /** List reads omit detailed recovery; null is distinct from an empty plan. */
  outputs: Array<{
    id: string;
    ordinal: number;
    kind: string;
    format: string;
    recovery: BreakoutOutputRecoveryResult;
  }> | null;
  outputRegistryStatus: 'not_loaded' | 'current' | 'conflict';
  capacity: BreakoutLiveCapacitySnapshot | null;
  readAt: string;
}
export interface BreakoutResponseListParams {
  page?: number;
  limit?: number;
  credentialId?: string;
}
export interface BreakoutResponseDetailParams {
  /** Optional read-only advisory snapshot; never reserves budget or quota. */
  strategyId?: string;
}
export interface BreakoutResponsePage {
  docs: BreakoutResponseView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
export interface BreakoutPostArtifactBindingInput
  extends BreakoutOutputRecoveryInput {
  postId: string;
}
export type BreakoutPostArtifactBindingResult =
  | { status: 'bound' | 'replayed'; outputId: string; postId: string }
  | {
      status: 'held';
      reason:
        | 'missing_output'
        | 'source_changed'
        | 'receipt_invalid'
        | 'artifact_changed'
        | 'binding_conflict'
        | 'review_or_publication_started'
        | 'unsupported_format';
    };
export type BreakoutTextArtifactBindingInput = BreakoutPostArtifactBindingInput;
export type BreakoutTextArtifactBindingResult =
  BreakoutPostArtifactBindingResult;
export type BreakoutOutputRecoveryState =
  | 'not_submitted'
  | 'generation_in_flight'
  | 'reconciliation_required'
  | 'generated'
  | 'draft'
  | 'awaiting_review'
  | 'scheduled'
  | 'paused'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'suppressed'
  | 'expired';
export type BreakoutOutputRecoveryReason =
  | 'not_dispatched'
  | 'provider_pending'
  | 'generation_receipt_missing'
  | 'receipt_invalid'
  | 'generation_outcome_indeterminate'
  | 'generation_failed'
  | 'quality_or_brand_blocked'
  | 'approved_brand_required'
  | 'brand_review_required'
  | 'artifact_binding_missing'
  | 'publication_admission_required'
  | 'publication_confirmation_missing'
  | 'publication_in_flight'
  | 'publication_failed'
  | 'publication_paused'
  | 'publication_cancelled'
  | 'output_suppressed'
  | 'output_expired'
  | 'confirmed_publication';
export type BreakoutOutputRecoveryResult =
  | {
      status: 'available';
      responseId: string;
      outputId: string;
      state: BreakoutOutputRecoveryState;
      reason: BreakoutOutputRecoveryReason;
      action:
        | 'requires_admission'
        | 'wait'
        | 'reconcile'
        | 'use_existing_artifact'
        | 'none';
      /** No status/projection alone may authorize another paid request. */
      mayRepeatPaidRequest: false;
      postId: string | null;
      externalId: string | null;
    }
  | { status: 'unavailable'; reason: 'missing_output' | 'scope_mismatch' };
