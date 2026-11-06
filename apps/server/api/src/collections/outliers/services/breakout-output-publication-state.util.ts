import {
  BreakoutResponseOutputState,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/api-types/contracts';
import type { BreakoutOutputRecoveryResult } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

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
  if (output.state === BreakoutResponseOutputState.AWAITING_REVIEW)
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

/** The receipt-row fields recovery reads for an output's generation request. */
export const BREAKOUT_RECEIPT_ROW_SELECT = {
  id: true,
  organizationId: true,
  brandId: true,
  requestKey: true,
  candidateIndex: true,
  revision: true,
  state: true,
  mode: true,
  providerAttemptRef: true,
  projection: true,
} satisfies Prisma.BrandedGenerationReceiptSelect;

/**
 * What a validated generation receipt reads as while its generation is unsettled, failed,
 * blocked or never dispatched; `null` once it has produced material to check. Shared by text
 * and visual outputs.
 */
export function breakoutReceiptExecutionState(
  base: BreakoutRecoveryBase,
  receipt: Readonly<Pick<BrandedGenerationReceiptV1, 'execution' | 'state'>>,
  hasPost: boolean,
): BreakoutOutputRecoveryResult | null {
  if (receipt.execution?.result === 'indeterminate')
    return {
      ...base,
      state: 'reconciliation_required',
      reason: 'generation_outcome_indeterminate',
      action: 'reconcile',
    };
  if (receipt.execution?.result === 'pending')
    return {
      ...base,
      state: 'generation_in_flight',
      reason: 'provider_pending',
      action: 'wait',
    };
  if (receipt.execution?.result === 'failed')
    return {
      ...base,
      state: 'failed',
      reason: 'generation_failed',
      action: 'none',
    };
  if (receipt.state === 'blocked' || receipt.state === 'cancelled')
    return {
      ...base,
      state: 'awaiting_review',
      reason: 'quality_or_brand_blocked',
      action: 'none',
    };
  if (!receipt.execution && !hasPost)
    return {
      ...base,
      state: 'not_submitted',
      reason: 'not_dispatched',
      action: 'requires_admission',
    };
  return null;
}
