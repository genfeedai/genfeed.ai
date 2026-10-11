import { resolveBreakoutMediaFormat } from '@api/collections/outliers/services/breakout-media-format.util';
import {
  type BreakoutRecoveryBase,
  breakoutPublicationState,
} from '@api/collections/outliers/services/breakout-output-publication-state.util';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  type BrandedPostMaterialRecord,
  describeBrandedPostMaterialLayout,
} from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import {
  IngredientStatus,
  PersistedReviewDecision,
} from '@genfeedai/contracts';
import { brandedGenerationReceiptV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type {
  BreakoutOutputRecoveryInput,
  BreakoutOutputRecoveryResult,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

const READY_STATUSES: readonly string[] = [
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];
const FAILED_STATUSES: readonly string[] = [
  IngredientStatus.FAILED,
  IngredientStatus.REJECTED,
];

export type BreakoutMediaRecoveryContext = Readonly<{
  input: Readonly<BreakoutOutputRecoveryInput>;
  response: Readonly<{ id: string }>;
  output: Readonly<{
    format: string;
    generationKey: string;
    heldReason: string | null;
    state: string;
    workflowExecutionId: string | null;
  }>;
  /** The output's bound post, when composition already attached one. */
  post:
    | (BrandedPostMaterialRecord & {
        targetExecutionState: string;
        reviewDecision?: string | null;
        reviewVersionPinId?: string | null;
      })
    | null;
  base: BreakoutRecoveryBase;
}>;

/**
 * Retained facts of a visual output, read in the order its paid steps happen: the approved-brand
 * caption receipt, the generated visuals of its generation group, the composition onto the
 * caption draft, then the shared quality and publication state. Read-only; no status here
 * authorizes a repeated paid request, and a partly dispatched or unreadable step is reconciled.
 */
export async function readBreakoutMediaOutputRecovery(
  tx: Prisma.TransactionClient,
  context: BreakoutMediaRecoveryContext,
): Promise<BreakoutOutputRecoveryResult> {
  const { input, output, post, base } = context;
  const { organizationId, brandId, platform } = input;
  const support = resolveBreakoutMediaFormat(
    platform,
    output.format as Parameters<typeof resolveBreakoutMediaFormat>[1],
  );
  if (support.status === 'held')
    return {
      ...base,
      state: 'awaiting_review',
      reason: support.reason,
      action: 'none',
    };
  const { plan } = support;
  const row = await tx.brandedGenerationReceipt.findFirst({
    where: {
      organizationId,
      brandId,
      requestKey: output.generationKey,
      candidateIndex: 0,
      isDeleted: false,
    },
    select: {
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
    },
  });
  if (!row) {
    if (
      !post &&
      output.state === 'reserved' &&
      output.heldReason === 'media_brand_capability_unavailable'
    )
      return {
        ...base,
        state: 'awaiting_review',
        reason: 'media_brand_capability_unavailable',
        action: 'none',
      };
    if (!output.workflowExecutionId && output.state === 'reserved' && !post)
      return {
        ...base,
        state: 'not_submitted',
        reason: 'not_dispatched',
        action: 'requires_admission',
      };
    return {
      ...base,
      state: 'reconciliation_required',
      reason: 'generation_receipt_missing',
      action: 'reconcile',
    };
  }
  const parsed = brandedGenerationReceiptV1Schema.safeParse(row.projection);
  const receipt = parsed.success ? parsed.data : null;
  if (
    !receipt ||
    row.organizationId !== organizationId ||
    row.brandId !== brandId ||
    row.requestKey !== output.generationKey ||
    row.candidateIndex !== 0 ||
    receipt.id !== row.id ||
    receipt.organizationId !== organizationId ||
    receipt.brandId !== brandId ||
    receipt.requestKey !== output.generationKey ||
    receipt.candidateIndex !== 0 ||
    receipt.isDeleted ||
    receipt.revision !== row.revision ||
    receipt.state !== row.state ||
    receipt.mode !== row.mode ||
    (receipt.execution?.providerAttemptRef ?? null) !==
      row.providerAttemptRef ||
    // The receipt proves the caption, a text post under the output's own scope.
    receipt.format !== 'text' ||
    (receipt.platform !== undefined && receipt.platform !== platform)
  )
    return {
      ...base,
      state: 'reconciliation_required',
      reason: 'receipt_invalid',
      action: 'reconcile',
    };
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
  if (!receipt.execution && !post)
    return {
      ...base,
      state: 'not_submitted',
      reason: 'not_dispatched',
      action: 'requires_admission',
    };
  if (!receipt.artifact)
    return {
      ...base,
      state: 'reconciliation_required',
      reason: 'artifact_binding_missing',
      action: 'reconcile',
    };
  if (receipt.mode !== 'approved_brand')
    return {
      ...base,
      state: 'awaiting_review',
      reason: 'approved_brand_required',
      action: 'none',
    };
  const captionPostId = receipt.artifact.id;
  const visuals = await tx.ingredient.findMany({
    where: {
      organizationId,
      brandId,
      groupId: output.generationKey,
      workflowExecutionId: output.workflowExecutionId,
      isDeleted: false,
    },
    orderBy: [{ groupIndex: 'asc' }, { id: 'asc' }],
    take: 9,
    select: {
      id: true,
      groupIndex: true,
      sourceActionId: true,
      status: true,
      s3Key: true,
      version: true,
    },
  });
  if (visuals.length === 0)
    return output.state === 'reserved'
      ? {
          ...base,
          postId: captionPostId,
          state: 'not_submitted',
          reason: 'not_dispatched',
          action: 'requires_admission',
        }
      : {
          ...base,
          postId: captionPostId,
          state: 'reconciliation_required',
          reason: 'media_generation_incomplete',
          action: 'reconcile',
        };
  if (
    visuals.length !== plan.parts ||
    visuals.some(
      (visual, index) =>
        visual.groupIndex !== index ||
        visual.sourceActionId !== `${output.generationKey}:media:${index + 1}`,
    )
  )
    return {
      ...base,
      postId: captionPostId,
      state: 'reconciliation_required',
      reason: 'media_generation_incomplete',
      action: 'reconcile',
    };
  if (visuals.some((visual) => FAILED_STATUSES.includes(String(visual.status))))
    return {
      ...base,
      postId: captionPostId,
      state: 'failed',
      reason: 'generation_failed',
      action: 'none',
    };
  if (
    visuals.some(
      (visual) =>
        !READY_STATUSES.includes(String(visual.status)) ||
        !visual.s3Key ||
        (visual.version ?? 0) < 1,
    )
  )
    return {
      ...base,
      postId: captionPostId,
      state: 'generation_in_flight',
      reason: 'provider_pending',
      action: 'wait',
    };
  if (!post)
    return {
      ...base,
      postId: captionPostId,
      state: 'generated',
      reason: 'artifact_binding_missing',
      action: 'use_existing_artifact',
    };
  // Composed: the post must still be exactly the verified caption plus this group's visuals.
  const attached = post.ingredients.map((item) => item.id).sort();
  const expected = visuals.map((visual) => visual.id).sort();
  let layoutFormat: string | null = null;
  try {
    layoutFormat = describeBrandedPostMaterialLayout(input, post).format;
  } catch {
    layoutFormat = null;
  }
  if (
    layoutFormat !== output.format ||
    attached.length !== expected.length ||
    expected.some((id, index) => id !== attached[index]) ||
    receipt.artifact.version !== hashBrandedGenerationTextV1(post.description)
  )
    return {
      ...base,
      state: 'reconciliation_required',
      reason: 'artifact_binding_missing',
      action: 'reconcile',
    };
  // Factual coverage stays unverified, so a member's explicit approval of this exact post version
  // (the pin is cleared when its material changes) clears a needs-review caption.
  const isReviewCleared =
    receipt.state === 'needs_review' &&
    post?.reviewDecision === PersistedReviewDecision.APPROVED &&
    Boolean(post.reviewVersionPinId);
  if (
    (receipt.state !== 'ready' || receipt.compliance !== 'passed') &&
    !isReviewCleared
  )
    return {
      ...base,
      state: 'awaiting_review',
      reason: 'brand_review_required',
      action: 'none',
    };
  return breakoutPublicationState(base, output, post);
}
