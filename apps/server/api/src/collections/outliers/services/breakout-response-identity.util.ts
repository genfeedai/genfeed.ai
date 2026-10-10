import { buildArtifactContentDigest } from '@api/agent-artifacts/agent-artifact-material.util';
import { readBreakoutBaselineReceipt } from '@api/collections/outliers/services/breakout-baseline-receipt.util';
import { Platform } from '@genfeedai/contracts';
import type {
  BreakoutBaselineReadInput,
  BreakoutOutputPlanInput,
  BreakoutOutputPlanResult,
  BreakoutResponseRegistrationResult,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';

const FORMATS = [
  'text',
  'image',
  'carousel',
  'video',
  'short',
  'thread',
] as const;
function hash(value: unknown): string {
  return buildArtifactContentDigest({ evidence: value });
}

/** Detect an identity only. This transaction does not admit generation or publication. */
export async function registerBreakoutResponse(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutBaselineReadInput>,
): Promise<BreakoutResponseRegistrationResult> {
  const receipt = await readBreakoutBaselineReceipt(tx, input);
  if (!('receiptId' in receipt)) return receipt;
  if (receipt.evaluation.status !== 'breakout')
    return { status: 'evidence_held', reason: receipt.evaluation.status };
  if (
    receipt.evaluation.targetObservationId !== input.targetObservationId ||
    receipt.evaluation.metric !== input.metric
  )
    return { status: 'invalid_observation' };
  const target = await tx.postExposureObservation.findFirst({
    where: {
      id: input.targetObservationId,
      organizationId: input.organizationId,
      brandId: input.brandId,
      credentialId: input.credentialId,
      platform: input.platform,
      format: input.format,
      isDeleted: false,
    },
  });
  if (!target) return { status: 'missing_target' };
  if (
    target.id !== input.targetObservationId ||
    target.organizationId !== input.organizationId ||
    target.brandId !== input.brandId ||
    target.credentialId !== input.credentialId ||
    target.platform !== input.platform ||
    target.format !== input.format ||
    target.isDeleted ||
    Boolean(target.postId) === Boolean(target.nativeSourcePostId)
  )
    return { status: 'invalid_observation' };
  if (target.isResponse)
    return { status: 'evidence_held', reason: 'response_source' };
  const where = {
    organizationId: input.organizationId,
    credentialId: input.credentialId,
    platform: input.platform,
    externalId: target.externalId,
  };
  const inserted = await tx.breakoutResponse.createMany({
    data: {
      ...where,
      brandId: input.brandId,
      logicalPostId: target.logicalPostId,
      sourcePostId: target.postId,
      nativeSourcePostId: target.nativeSourcePostId,
      triggerReceiptId: receipt.receiptId,
      publicationFingerprint: target.publicationFingerprint,
      contentDigest: target.contentDigest,
      detectedAt: target.receivedAt,
    },
    skipDuplicates: true,
  });
  const retained = await tx.breakoutResponse.findFirst({
    where: {
      ...where,
      brandId: input.brandId,
      isDeleted: false,
    },
    select: {
      id: true,
      triggerReceiptId: true,
      logicalPostId: true,
      sourcePostId: true,
      nativeSourcePostId: true,
      publicationFingerprint: true,
      contentDigest: true,
    },
  });
  if (
    !retained ||
    retained.logicalPostId !== target.logicalPostId ||
    retained.sourcePostId !== target.postId ||
    retained.nativeSourcePostId !== target.nativeSourcePostId ||
    retained.publicationFingerprint !== target.publicationFingerprint ||
    retained.contentDigest !== target.contentDigest
  )
    return { status: 'identity_conflict' };
  return {
    status: inserted.count === 1 ? 'registered' : 'replayed',
    responseId: retained.id,
    triggerReceiptId: retained.triggerReceiptId,
  };
}

/** One immutable plan, serialized by the response row. Caller must roll back any thrown conflict. */
export async function reserveBreakoutOutputPlan(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutOutputPlanInput>,
): Promise<BreakoutOutputPlanResult> {
  const slots = input.slots
    .map(({ ordinal, kind, format }) => ({ ordinal, kind, format }))
    .sort((left, right) => left.ordinal - right.ordinal);
  if (
    slots.length === 0 ||
    slots.length > 5 ||
    slots.some(
      (slot, index) =>
        slot.ordinal !== index + 1 ||
        !FORMATS.some((format) => slot.format === format) ||
        (slot.kind !== 'follow_up' && slot.kind !== 'quote') ||
        (slot.kind === 'quote' &&
          (slot.ordinal !== 1 ||
            slot.format !== 'text' ||
            input.platform !== Platform.TWITTER)),
    )
  )
    return { status: 'invalid_plan' };
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "breakout_responses"
    WHERE "id" = ${input.responseId} AND "organizationId" = ${input.organizationId}
      AND "brandId" = ${input.brandId} AND "credentialId" = ${input.credentialId}
      AND "platform" = ${input.platform} AND "isDeleted" = false
    FOR UPDATE
  `);
  const where = {
    id: input.responseId,
    organizationId: input.organizationId,
    brandId: input.brandId,
    credentialId: input.credentialId,
    platform: input.platform,
    isDeleted: false,
  };
  const response = await tx.breakoutResponse.findFirst({ where });
  if (!response) return { status: 'missing_response' };
  const planFingerprint = hash(['breakout-output-plan-v1', where, slots]);
  if (
    response.outputPlanFingerprint &&
    response.outputPlanFingerprint !== planFingerprint
  )
    return { status: 'plan_conflict' };
  const replay = response.outputPlanFingerprint !== null;
  if (!replay && response.state !== 'detected')
    return { status: 'plan_conflict' };
  const data = slots.map((slot) => ({
    organizationId: input.organizationId,
    brandId: input.brandId,
    credentialId: input.credentialId,
    responseId: input.responseId,
    ordinal: slot.ordinal,
    kind: slot.kind,
    format: slot.format,
    generationKey: hash([
      'breakout-output-generation-v1',
      input.organizationId,
      input.responseId,
      slot.ordinal,
    ]),
  }));
  if (!replay) {
    const inserted = await tx.breakoutResponseOutput.createMany({
      data,
      skipDuplicates: true,
    });
    if (inserted.count !== slots.length)
      throw new Error('Breakout output slot conflict; roll back transaction');
    const committed = await tx.breakoutResponse.updateMany({
      where: {
        ...where,
        state: 'detected',
        outputPlanFingerprint: null,
      },
      data: { state: 'planned', outputPlanFingerprint: planFingerprint },
    });
    if (committed.count !== 1)
      throw new Error('Breakout output plan changed; roll back transaction');
  }
  const retained = await tx.breakoutResponseOutput.findMany({
    where: {
      responseId: input.responseId,
      organizationId: input.organizationId,
      brandId: input.brandId,
      credentialId: input.credentialId,
      isDeleted: false,
    },
    orderBy: { ordinal: 'asc' },
    take: 6,
    select: {
      id: true,
      ordinal: true,
      kind: true,
      format: true,
      generationKey: true,
    },
  });
  if (
    retained.length !== data.length ||
    retained.some(
      (row, index) =>
        row.ordinal !== data[index].ordinal ||
        row.kind !== data[index].kind ||
        row.format !== data[index].format ||
        row.generationKey !== data[index].generationKey,
    )
  ) {
    if (!replay)
      throw new Error(
        'Breakout output plan was not retained; roll back transaction',
      );
    return { status: 'plan_conflict' };
  }
  return {
    status: replay ? 'replayed' : 'reserved',
    outputIds: retained.map((row) => row.id),
    generationKeys: retained.map((row) => row.generationKey),
  };
}
