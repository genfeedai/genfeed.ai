import { readBreakoutGrowth } from '@api/collections/outliers/services/breakout-growth.util';
import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import {
  breakoutPublicationId,
  loadBreakoutPublication,
} from '@api/collections/outliers/services/breakout-publication-source.util';
import { reserveBreakoutOutputPlan } from '@api/collections/outliers/services/breakout-response-identity.util';
import type {
  BreakoutCapacityReservationInput,
  BreakoutCapacityReservationResult,
  BreakoutLiveCapacityReservationInput,
  BreakoutLiveCapacityReservationResult,
  BreakoutOutputPlanSlot,
} from '@genfeedai/contracts/interfaces';
import type { LearningFormat } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { planBreakoutCapacity } from '@genfeedai/helpers';
import { Prisma } from '@genfeedai/prisma';

function isFormat(value: string): value is LearningFormat {
  return ['text', 'image', 'carousel', 'video', 'short', 'thread'].includes(
    value,
  );
}

export async function reserveBreakoutLiveCapacityPlan(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutLiveCapacityReservationInput>,
): Promise<BreakoutLiveCapacityReservationResult> {
  const snapshot = await readBreakoutLiveCapacity(tx, {
    ...input.source,
    strategyId: input.strategyId,
    nowMs: input.nowMs,
  });
  if (snapshot.status === 'held') return snapshot;
  return reserveBreakoutCapacityPlan(tx, {
    ...input,
    budget: snapshot.budget,
    remainingPublicationSlots: snapshot.remainingPublicationSlots,
    nowMs: input.nowMs,
  });
}

/** Reserve immutable identities from a capacity snapshot. Live execution still needs admission. */
export async function reserveBreakoutCapacityPlan(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutCapacityReservationInput>,
): Promise<BreakoutCapacityReservationResult> {
  const { organizationId, brandId, credentialId, platform } = input.source;
  // Serialize replay and first planning with the registry's same parent row lock.
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "breakout_responses"
    WHERE "id" = ${input.responseId} AND "organizationId" = ${organizationId}
      AND "brandId" = ${brandId} AND "credentialId" = ${credentialId}
      AND "platform" = ${platform} AND "isDeleted" = false FOR UPDATE
  `);
  const response = await tx.breakoutResponse.findFirst({
    where: {
      id: input.responseId,
      organizationId,
      brandId,
      credentialId,
      platform,
      isDeleted: false,
    },
  });
  if (!response) return { status: 'missing_response' };
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
    source.format !== input.source.format ||
    'postId' in source !== 'postId' in input.source ||
    breakoutPublicationId(source) !== breakoutPublicationId(input.source) ||
    source.externalId !== input.source.externalId ||
    source.logicalPostId !== response.logicalPostId ||
    source.logicalPostId !== input.source.logicalPostId ||
    source.contentDigest !== response.contentDigest ||
    source.contentDigest !== input.source.contentDigest ||
    source.publicationFingerprint !== response.publicationFingerprint ||
    source.publicationFingerprint !== input.source.publicationFingerprint
  )
    return { status: 'source_changed' };
  const trigger = await tx.breakoutBaselineReceipt.findFirst({
    where: {
      id: response.triggerReceiptId,
      organizationId,
      brandId,
      credentialId,
      platform,
      isDeleted: false,
    },
    select: { metric: true },
  });
  if (
    !trigger ||
    (trigger.metric !== 'views' && trigger.metric !== 'impressions')
  )
    return { status: 'growth_held', reason: 'growth_evidence_unavailable' };
  const growth = await readBreakoutGrowth(tx, {
    source,
    metric: trigger.metric,
    nowMs: input.nowMs ?? Date.now(),
  });
  if (growth.status === 'held')
    return { status: 'growth_held', reason: growth.reason };
  const scope = {
    organizationId,
    brandId,
    credentialId,
    platform,
    responseId: response.id,
  };
  if (response.outputPlanFingerprint !== null) {
    const retained = await tx.breakoutResponseOutput.findMany({
      where: {
        organizationId,
        brandId,
        credentialId,
        responseId: response.id,
        isDeleted: false,
      },
      orderBy: { ordinal: 'asc' },
      take: 6,
      select: { ordinal: true, kind: true, format: true },
    });
    const slots: BreakoutOutputPlanSlot[] = [];
    for (const row of retained) {
      if (
        !isFormat(row.format) ||
        (row.kind !== 'quote' && row.kind !== 'follow_up')
      )
        return { status: 'plan_conflict' };
      slots.push({ ordinal: row.ordinal, kind: row.kind, format: row.format });
    }
    if (!slots.length) return { status: 'plan_conflict' };
    const result = await reserveBreakoutOutputPlan(tx, { ...scope, slots });
    return 'outputIds' in result ? { ...result, estimate: null } : result;
  }
  const estimate = planBreakoutCapacity({ ...input, source });
  if (estimate.status === 'held') return { status: 'capacity_held', estimate };
  const result = await reserveBreakoutOutputPlan(tx, {
    ...scope,
    slots: estimate.slots,
  });
  return 'outputIds' in result ? { ...result, estimate } : result;
}
