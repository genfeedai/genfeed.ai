import {
  isBreakoutMediaFormat,
  resolveBreakoutMediaFormat,
} from '@api/collections/outliers/services/breakout-media-format.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  brandedPostMaterialSelect,
  describeBrandedPostMaterialLayout,
} from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  IngredientCategory,
  IngredientStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { brandedGenerationReceiptV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type { BreakoutOutputRecoveryInput } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';

export type BreakoutMediaArtifactBindingInput = BreakoutOutputRecoveryInput & {
  /** The output's caption draft, a plain text post written by the approved-brand caption. */
  postId: string;
};
export type BreakoutMediaArtifactBindingResult =
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
        | 'unsupported_format'
        | 'media_incomplete';
    };

const READY_STATUSES: readonly string[] = [
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

function held(
  reason: Extract<
    BreakoutMediaArtifactBindingResult,
    { status: 'held' }
  >['reason'],
): BreakoutMediaArtifactBindingResult {
  return { status: 'held', reason };
}

/** The post's first line as a title-sized label (YouTube titles hold 100 characters). */
function captionLabel(caption: string): string {
  const [first = ''] = caption.trim().split(/\r?\n/u);
  return first.slice(0, 100);
}

/**
 * Composes a visual output: attaches the output's retained, generated visuals to the caption
 * draft and binds the draft to the output, in one transaction. It verifies every proof first:
 * the approved-brand caption receipt against the draft's unchanged text, each visual against
 * the output's generation group (identity, order, ready status, stored version) and the current
 * source. It creates no post, provider request, credit charge, approval or publish state.
 * Conflicting lineage, a draft already in review or publication, or any change is held.
 */
export async function bindBreakoutMediaPostArtifact(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutMediaArtifactBindingInput>,
): Promise<BreakoutMediaArtifactBindingResult> {
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
    return held('missing_output');
  const support = isBreakoutMediaFormat(output.format)
    ? resolveBreakoutMediaFormat(platform, output.format)
    : null;
  if (output.kind !== 'follow_up' || support?.status !== 'supported')
    return held('unsupported_format');
  const { plan } = support;
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
    return held('source_changed');
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
  if (!post) return held('artifact_changed');
  const alreadyBound = post.breakoutOutputId === outputId;
  if (post.breakoutOutputId !== null && !alreadyBound)
    return held('binding_conflict');
  const existing = await tx.post.findFirst({
    where: {
      organizationId,
      brandId,
      breakoutOutputId: outputId,
      isDeleted: false,
    },
    select: { id: true },
  });
  if (existing && existing.id !== postId) return held('binding_conflict');
  // The caption proof: a completed approved-brand receipt whose artifact is exactly this draft's
  // current text. The visuals are not part of the receipt; they are proven below.
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
  if (!row || !parsed.success) return held('receipt_invalid');
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
    receipt.format !== 'text' ||
    (receipt.platform !== undefined && receipt.platform !== platform) ||
    // A needs-review caption is composed and queued for a member's review; recovery and
    // publication admission keep it unpublishable until that review clears this version.
    !(
      (receipt.state === 'ready' && receipt.compliance === 'passed') ||
      (receipt.state === 'needs_review' && receipt.compliance === 'unverified')
    )
  )
    return held('receipt_invalid');
  const artifact = receipt.artifact;
  if (
    artifact?.kind !== 'post' ||
    artifact.id !== postId ||
    artifact.version !== hashBrandedGenerationTextV1(post.description)
  )
    return held('artifact_changed');
  // The visuals: exactly the output's generation group, in order, all ready with stored bytes.
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
      category: true,
      cdnUrl: true,
    } as Prisma.IngredientSelect,
  });
  const category =
    plan.mediaKind === 'image'
      ? IngredientCategory.IMAGE
      : IngredientCategory.VIDEO;
  const urls = visuals.map(
    (visual) => Reflect.get(visual, 'cdnUrl') as string | null,
  );
  if (
    visuals.length !== plan.parts ||
    visuals.some(
      (visual, index) =>
        visual.groupIndex !== index ||
        visual.sourceActionId !== `${output.generationKey}:media:${index + 1}`,
    )
  )
    return held('media_incomplete');
  if (
    visuals.some(
      (visual, index) =>
        visual.category !== category ||
        !READY_STATUSES.includes(String(visual.status)) ||
        !visual.s3Key ||
        (visual.version ?? 0) < 1 ||
        (plan.parts > 1 && typeof urls[index] !== 'string'),
    )
  )
    return held('media_incomplete');
  const visualIds = visuals.map((visual) => visual.id);
  if (alreadyBound) {
    const attached = post.ingredients.map((item) => item.id).sort();
    return attached.length === visualIds.length &&
      [...visualIds].sort().every((id, index) => id === attached[index])
      ? { status: 'replayed', outputId, postId }
      : held('binding_conflict');
  }
  if (
    post.targetExecutionState !== TargetExecutionState.DRAFT ||
    post.publishApprovalId ||
    post.reviewVersionPinId
  )
    return held('review_or_publication_started');
  if (
    post.ingredients.length > 0 ||
    post.children.length > 0 ||
    post.quoteTweetId !== null
  )
    return held('artifact_changed');
  if (
    response.state !== 'planned' ||
    output.state === 'suppressed' ||
    output.state === 'expired'
  )
    return held('binding_conflict');
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
      description: post.description,
      targetExecutionState: TargetExecutionState.DRAFT,
      publishApprovalId: null,
      reviewVersionPinId: null,
    },
    data: {
      breakoutOutputId: outputId,
      category: plan.postCategory,
      label: captionLabel(post.description),
      // A carousel keeps its generated order explicitly; the layout otherwise sorts by id.
      ...(plan.parts > 1
        ? { targetAttachments: urls as Prisma.InputJsonValue }
        : {}),
    },
  });
  if (changed.count !== 1)
    throw new Error('Breakout media binding changed; roll back transaction');
  await tx.post.update({
    where: scopedWhere(organizationId, { id: postId }),
    data: { ingredients: { connect: visualIds.map((id) => ({ id })) } },
  });
  // The composed material must read back as exactly this output's format.
  const composed = await tx.post.findFirst({
    where: { id: postId, organizationId, brandId, isDeleted: false },
    select: brandedPostMaterialSelect,
  });
  const layout = composed
    ? describeBrandedPostMaterialLayout(input, composed)
    : null;
  if (
    !layout ||
    layout.format !== output.format ||
    layout.entries.filter((entry) => entry.kind === 'media').length !==
      plan.parts
  )
    throw new Error('Breakout media layout changed; roll back transaction');
  return { status: 'bound', outputId, postId };
}
