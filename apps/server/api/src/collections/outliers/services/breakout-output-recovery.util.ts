import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { loadPostExposurePublication } from '@api/collections/outliers/services/post-exposure-observation.util';
import {
  type BrandedPostMaterialRecord,
  bindBrandedPostMaterialLayout,
  brandedPostMaterialSelect,
  describeBrandedPostMaterialLayout,
} from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import { Platform, TargetExecutionState } from '@genfeedai/contracts';
import { brandedGenerationReceiptV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type {
  BreakoutOutputRecoveryInput,
  BreakoutOutputRecoveryResult,
  BreakoutPostArtifactBindingInput,
  BreakoutPostArtifactBindingResult,
  BreakoutTextArtifactBindingInput,
  BreakoutTextArtifactBindingResult,
} from '@genfeedai/contracts/interfaces';
import type { BrandGenerationArtifactV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { Prisma } from '@genfeedai/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';

/** Compare complete retained material; this does not acquire or authorize new provider work. */
function matchesPostArtifact(
  scope: Readonly<BreakoutOutputRecoveryInput>,
  post: BrandedPostMaterialRecord,
  artifact: BrandGenerationArtifactV1 | null,
  format: string,
): boolean {
  if (artifact?.kind !== 'post' || artifact.id !== post.id) return false;
  try {
    const layout = describeBrandedPostMaterialLayout(scope, post);
    const current = bindBrandedPostMaterialLayout(layout, artifact.parts);
    return (
      layout.format === format &&
      current.artifact.version === artifact.version &&
      current.artifact.mediaKind === artifact.mediaKind &&
      current.artifact.contentHash === artifact.contentHash
    );
  } catch (error) {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException
    )
      return false;
    throw error;
  }
}

/** Attach completed text lineage before review. Caller must authorize access separately. */
export async function bindBreakoutTextArtifact(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutTextArtifactBindingInput>,
): Promise<BreakoutTextArtifactBindingResult> {
  return bindPostArtifact(tx, input, true);
}

/** Attach a complete canonical output before normal quality/review/publication admission. */
export async function bindBreakoutPostArtifact(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutPostArtifactBindingInput>,
): Promise<BreakoutPostArtifactBindingResult> {
  return bindPostArtifact(tx, input, false);
}

async function bindPostArtifact(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutPostArtifactBindingInput>,
  textOnly: boolean,
): Promise<BreakoutPostArtifactBindingResult> {
  const {
    organizationId,
    brandId,
    credentialId,
    platform,
    responseId,
    outputId,
    postId,
  } = input;
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "posts" WHERE "id" = ${postId} AND "organizationId" = ${organizationId}
      AND "brandId" = ${brandId} AND "credentialId" = ${credentialId}
      AND "platform" = ${platform} AND "isDeleted" = false FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "breakout_responses" WHERE "id" = ${responseId} AND "organizationId" = ${organizationId}
      AND "brandId" = ${brandId} AND "credentialId" = ${credentialId}
      AND "platform" = ${platform} AND "isDeleted" = false FOR UPDATE
  `);
  const response = await tx.breakoutResponse.findFirst({
    where: {
      id: responseId,
      organizationId,
      brandId,
      credentialId,
      platform,
      isDeleted: false,
    },
  });
  const output = await tx.breakoutResponseOutput.findFirst({
    where: {
      id: outputId,
      responseId,
      organizationId,
      brandId,
      credentialId,
      isDeleted: false,
    },
  });
  if (!response || !output || response.outputPlanFingerprint === null)
    return { status: 'held', reason: 'missing_output' };
  if (
    (textOnly && output.format !== 'text') ||
    (output.kind !== 'follow_up' && output.kind !== 'quote') ||
    (output.kind === 'quote' &&
      (platform !== Platform.TWITTER ||
        output.ordinal !== 1 ||
        output.format !== 'text'))
  )
    return { status: 'held', reason: 'unsupported_format' };
  const source = await loadBreakoutPublication(tx, {
    organizationId,
    brandId,
    credentialId,
    platform,
    postId: response.sourcePostId,
    nativeSourcePostId: response.nativeSourcePostId,
    externalId: response.externalId,
  });
  if (
    !source ||
    source.isResponse ||
    source.logicalPostId !== response.logicalPostId ||
    source.contentDigest !== response.contentDigest ||
    source.publicationFingerprint !== response.publicationFingerprint
  )
    return { status: 'held', reason: 'source_changed' };
  const post = await tx.post.findFirst({
    where: {
      id: postId,
      organizationId,
      brandId,
      credentialId,
      platform,
      parentId: null,
      isDeleted: false,
    },
    select: {
      ...brandedPostMaterialSelect,
      breakoutOutputId: true,
      quoteTweetId: true,
      targetExecutionState: true,
      publishApprovalId: true,
      reviewVersionPinId: true,
    },
  });
  if (!post) return { status: 'held', reason: 'artifact_changed' };
  const alreadyBound = post.breakoutOutputId === outputId;
  if (post.breakoutOutputId !== null && !alreadyBound)
    return { status: 'held', reason: 'binding_conflict' };
  const existing = await tx.post.findFirst({
    where: {
      organizationId,
      brandId,
      breakoutOutputId: outputId,
      isDeleted: false,
    },
    select: { id: true },
  });
  if (existing && existing.id !== postId)
    return { status: 'held', reason: 'binding_conflict' };
  const row = await tx.brandedGenerationReceipt.findFirst({
    where: {
      organizationId,
      brandId,
      requestKey: output.generationKey,
      candidateIndex: 0,
      isDeleted: false,
    },
  });
  const parsed = brandedGenerationReceiptV1Schema.safeParse(row?.projection);
  if (!row || !parsed.success)
    return { status: 'held', reason: 'receipt_invalid' };
  const receipt = parsed.data;
  if (
    receipt.id !== row.id ||
    receipt.organizationId !== organizationId ||
    receipt.brandId !== brandId ||
    receipt.requestKey !== output.generationKey ||
    receipt.candidateIndex !== 0 ||
    receipt.revision !== row.revision ||
    receipt.state !== row.state ||
    receipt.mode !== row.mode ||
    receipt.isDeleted ||
    receipt.mode !== 'approved_brand' ||
    receipt.execution?.result !== 'completed' ||
    receipt.execution.providerAttemptRef !== row.providerAttemptRef ||
    receipt.format !== output.format ||
    (receipt.platform !== undefined && receipt.platform !== platform)
  )
    return { status: 'held', reason: 'receipt_invalid' };
  const artifact = receipt.artifact;
  if (!matchesPostArtifact(input, post, artifact, output.format))
    return { status: 'held', reason: 'artifact_changed' };
  const quoteTweetId = output.kind === 'quote' ? response.externalId : null;
  if (post.quoteTweetId !== null && post.quoteTweetId !== quoteTweetId)
    return { status: 'held', reason: 'binding_conflict' };
  if (alreadyBound)
    return post.quoteTweetId === quoteTweetId
      ? { status: 'replayed', outputId, postId }
      : { status: 'held', reason: 'binding_conflict' };
  if (
    post.targetExecutionState !== TargetExecutionState.DRAFT ||
    post.publishApprovalId ||
    post.reviewVersionPinId
  )
    return { status: 'held', reason: 'review_or_publication_started' };
  if (
    response.state !== 'planned' ||
    output.state === 'suppressed' ||
    output.state === 'expired'
  )
    return { status: 'held', reason: 'binding_conflict' };
  const changed = await tx.post.updateMany({
    where: {
      id: postId,
      organizationId,
      brandId,
      credentialId,
      platform,
      parentId: null,
      isDeleted: false,
      breakoutOutputId: null,
      quoteTweetId: post.quoteTweetId,
      description: post.description,
      targetExecutionState: TargetExecutionState.DRAFT,
      publishApprovalId: null,
      reviewVersionPinId: null,
    },
    data: {
      breakoutOutputId: outputId,
      ...(output.kind === 'quote' ? { quoteTweetId } : {}),
    },
  });
  if (changed.count !== 1)
    throw new Error('Breakout artifact binding changed; roll back transaction');
  return { status: 'bound', outputId, postId };
}

/** Read retained facts only. The result never grants dispatch, retry or publication authority. */
export async function readBreakoutOutputRecovery(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutOutputRecoveryInput>,
): Promise<BreakoutOutputRecoveryResult> {
  const {
    organizationId,
    brandId,
    credentialId,
    platform,
    responseId,
    outputId,
  } = input;
  const response = await tx.breakoutResponse.findFirst({
    where: {
      id: responseId,
      organizationId,
      brandId,
      credentialId,
      platform,
      isDeleted: false,
    },
  });
  if (!response) return { status: 'unavailable', reason: 'missing_output' };
  const output = await tx.breakoutResponseOutput.findFirst({
    where: {
      id: outputId,
      responseId,
      organizationId,
      brandId,
      credentialId,
      isDeleted: false,
    },
  });
  if (!output) return { status: 'unavailable', reason: 'missing_output' };
  if (
    response.id !== responseId ||
    response.organizationId !== organizationId ||
    response.brandId !== brandId ||
    response.credentialId !== credentialId ||
    response.platform !== platform ||
    response.isDeleted ||
    output.id !== outputId ||
    output.responseId !== responseId ||
    output.organizationId !== organizationId ||
    output.brandId !== brandId ||
    output.credentialId !== credentialId ||
    output.isDeleted
  )
    return { status: 'unavailable', reason: 'scope_mismatch' };
  const post = await tx.post.findFirst({
    where: {
      breakoutOutputId: outputId,
      organizationId,
      brandId,
      credentialId,
      platform,
      parentId: null,
      isDeleted: false,
    },
    select: {
      ...brandedPostMaterialSelect,
      externalId: true,
      targetExecutionState: true,
      quoteTweetId: true,
    },
  });
  const base = {
    status: 'available' as const,
    responseId,
    outputId,
    mayRepeatPaidRequest: false as const,
    postId: post?.id ?? null,
    externalId: null,
  };
  const quoteBound =
    output.kind !== 'quote' || post?.quoteTweetId === response.externalId;
  if (
    post?.targetExecutionState === TargetExecutionState.PUBLISHED &&
    post.externalId &&
    quoteBound
  ) {
    const published = await loadPostExposurePublication(tx, {
      organizationId,
      brandId,
      credentialId,
      platform,
      postId: post.id,
      externalId: post.externalId,
    });
    if (published?.isResponse && published.format === output.format)
      return {
        ...base,
        externalId: published.externalId,
        state: 'published',
        reason: 'confirmed_publication',
        action: 'none',
      };
  }
  if (
    output.state === 'published' ||
    post?.targetExecutionState === TargetExecutionState.PUBLISHED
  )
    return {
      ...base,
      state: 'reconciliation_required',
      reason: 'publication_confirmation_missing',
      action: 'reconcile',
    };
  if (output.state === 'suppressed' || response.state === 'suppressed')
    return {
      ...base,
      state: 'suppressed',
      reason: 'output_suppressed',
      action: 'none',
    };
  if (output.state === 'expired' || response.state === 'expired')
    return {
      ...base,
      state: 'expired',
      reason: 'output_expired',
      action: 'none',
    };
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
      ['image', 'carousel', 'video', 'short'].includes(output.format) &&
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
  if (!parsed.success)
    return {
      ...base,
      state: 'reconciliation_required',
      reason: 'receipt_invalid',
      action: 'reconcile',
    };
  const receipt = parsed.data;
  if (
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
    receipt.format !== output.format ||
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
  if (
    receipt.state !== 'ready' ||
    receipt.compliance !== 'passed' ||
    output.state === 'awaiting_review'
  )
    return {
      ...base,
      state: 'awaiting_review',
      reason: 'brand_review_required',
      action: 'none',
    };
  // An ingredient receipt needs a separate verified material-binding contract.
  // Do not equate receipt manifest hashes with publication material digests.
  if (!post)
    return {
      ...base,
      state: 'generated',
      reason: 'artifact_binding_missing',
      action: 'use_existing_artifact',
    };
  if (
    !quoteBound ||
    !matchesPostArtifact(input, post, receipt.artifact, output.format)
  )
    return {
      ...base,
      state: 'reconciliation_required',
      reason: 'artifact_binding_missing',
      action: 'reconcile',
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
