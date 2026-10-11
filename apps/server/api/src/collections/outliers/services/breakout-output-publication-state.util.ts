import { TargetExecutionState } from '@genfeedai/contracts';
import type { BreakoutOutputRecoveryResult } from '@genfeedai/contracts/interfaces';

/** The identity every recovery result carries; it never grants a repeated paid request. */
export type BreakoutRecoveryBase = Readonly<{
  status: 'available';
  responseId: string;
  outputId: string;
  mayRepeatPaidRequest: false;
  postId: string | null;
  externalId: null;
}>;

/**
 * What an output reads as once its material is generated, composed and bound: its quality hold,
 * then the state of its one canonical post. Shared by text and visual outputs.
 */
export function breakoutPublicationState(
  base: BreakoutRecoveryBase,
  output: Readonly<{ heldReason: string | null; state: string }>,
  post: Readonly<{ targetExecutionState: string }>,
): BreakoutOutputRecoveryResult {
  if (output.heldReason === 'quality_evaluation_pending')
    return {
      ...base,
      state: 'reconciliation_required',
      reason: 'quality_evaluation_pending',
      action: 'reconcile',
    };
  if (output.heldReason === 'platform_quality_blocked')
    return {
      ...base,
      state: 'awaiting_review',
      reason: 'platform_quality_blocked',
      action: 'none',
    };
  if (output.state === 'awaiting_review')
    return {
      ...base,
      state: 'awaiting_review',
      reason: 'brand_review_required',
      action: 'none',
    };
  if (post.targetExecutionState === TargetExecutionState.PAUSED)
    return {
      ...base,
      state: 'paused',
      reason: 'publication_paused',
      action: 'none',
    };
  if (
    post.targetExecutionState === TargetExecutionState.CANCELLED ||
    post.targetExecutionState === TargetExecutionState.SKIPPED
  )
    return {
      ...base,
      state: 'suppressed',
      reason: 'publication_cancelled',
      action: 'none',
    };
  if (post.targetExecutionState === TargetExecutionState.PUBLISHING)
    return {
      ...base,
      state: 'publishing',
      reason: 'publication_in_flight',
      action: 'wait',
    };
  if (post.targetExecutionState === TargetExecutionState.SCHEDULED)
    return {
      ...base,
      state: 'scheduled',
      reason: 'publication_admission_required',
      action: 'none',
    };
  if (post.targetExecutionState === TargetExecutionState.FAILED)
    return {
      ...base,
      state: 'failed',
      reason: 'publication_failed',
      action: 'use_existing_artifact',
    };
  return {
    ...base,
    state: 'draft',
    reason: 'publication_admission_required',
    action: 'requires_admission',
  };
}
