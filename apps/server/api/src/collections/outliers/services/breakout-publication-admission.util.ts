import { scoreTextPublishGate } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.helpers';
import { readBreakoutGrowth } from '@api/collections/outliers/services/breakout-growth.util';
import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  brandedPostMaterialSelect,
  describeBrandedPostMaterialLayout,
} from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { BreakoutOutputRecoveryInput } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import { z } from 'zod';

/** Server-only input from the native pinned publication action, never a public request DTO. */
export type BreakoutPublicationAdmission = Readonly<{
  scope: Readonly<BreakoutOutputRecoveryInput>;
  strategyId: string;
  postId: string;
  workflowExecutionId: string;
  phase: 'schedule' | 'dispatch';
  /** Must verify original/current actor, exact material approval and actual operation/dispatch claim. */
  reauthorize: (tx: Prisma.TransactionClient) => Promise<void>;
}>;

const policySchema = z.object({
  isEnabled: z.boolean().optional(),
  goalProfile: z.string().optional(),
  publishPolicy: z
    .object({
      minPostScore: z.number().finite().min(0).max(100).optional(),
    })
    .optional(),
});
const analysisSchema = z.object({
  content: z.string(),
  overallScore: z.number().finite().min(0).max(100),
  metadata: z.object({ hasCallToAction: z.boolean().optional() }).optional(),
});

function hold(reason: string): never {
  throw new BusinessLogicException(`Breakout publication held: ${reason}`);
}

/**
 * Business evidence only: invoke in the native scheduling/dispatch transaction before future work.
 * Normal approval, provider reconciliation and actor admission remain mandatory. Never use this
 * gate to suppress recording a provider's already accepted outcome or to authorize a paid retry.
 */
export async function admitBreakoutPublication(
  tx: Prisma.TransactionClient,
  admission: BreakoutPublicationAdmission,
  nowMs = Date.now(),
): Promise<{ scoreId: string }> {
  await admission.reauthorize(tx);
  const key = `agent-strategy-config:${admission.strategyId}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  await admission.reauthorize(tx);
  await assertCurrentSourceGrowth(tx, admission, nowMs);
  const { scope } = admission;
  const recovery = await readBreakoutOutputRecovery(tx, scope);
  await admission.reauthorize(tx);
  const allowedReason =
    recovery.status === 'available' &&
    (recovery.reason === 'publication_admission_required' ||
      (admission.phase === 'dispatch' &&
        recovery.reason === 'publication_in_flight'));
  if (
    !allowedReason ||
    recovery.status !== 'available' ||
    recovery.postId !== admission.postId
  )
    hold(recovery.reason);
  const post = await tx.post.findFirst({
    where: {
      id: admission.postId,
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      credentialId: scope.credentialId,
      platform: scope.platform,
      parentId: null,
      breakoutOutputId: scope.outputId,
      agentStrategyId: admission.strategyId,
      workflowExecutionId: admission.workflowExecutionId,
      isDeleted: false,
    },
    select: {
      ...brandedPostMaterialSelect,
      groupId: true,
      targetExecutionState: true,
    },
  });
  await admission.reauthorize(tx);
  if (
    !post ||
    (post.targetExecutionState !== TargetExecutionState.DRAFT &&
      post.targetExecutionState !== TargetExecutionState.SCHEDULED &&
      !(
        admission.phase === 'dispatch' &&
        post.targetExecutionState === TargetExecutionState.PUBLISHING
      ))
  )
    hold('publication_state_changed');
  const layout = describeBrandedPostMaterialLayout(scope, post);
  if (
    (layout.format !== 'text' && layout.format !== 'thread') ||
    layout.entries.some((entry) => entry.kind !== 'text')
  )
    hold('format_capability_unavailable');
  const content = [
    layout.textBytes,
    ...layout.entries.map((entry) =>
      entry.kind === 'text' ? entry.bytes : null,
    ),
  ]
    .filter((bytes): bytes is Uint8Array => bytes !== null)
    .map((bytes) => Buffer.from(bytes).toString('utf8'))
    .join('\n\n');
  if (!content.trim()) hold('material_unavailable');
  const scoreId = await assertCurrentQuality(tx, admission, content);
  const capacity = await readBreakoutLiveCapacity(
    tx,
    {
      ...scope,
      strategyId: admission.strategyId,
      nowMs,
    },
    { postId: post.id, groupId: post.groupId },
  );
  await admission.reauthorize(tx);
  if (capacity.status === 'held') hold(capacity.reason);
  if (capacity.remainingPublicationSlots === null) hold('quota_unavailable');
  if (capacity.remainingPublicationSlots < 1) hold('quota_exhausted');
  // Publishing retained material does not manufacture another generation credit charge.
  // Native publication billing/admission, if any, must still run normally.
  return { scoreId };
}

async function assertCurrentSourceGrowth(
  tx: Prisma.TransactionClient,
  admission: BreakoutPublicationAdmission,
  nowMs: number,
): Promise<void> {
  const { scope } = admission;
  const response = await tx.breakoutResponse.findFirst({
    where: {
      id: scope.responseId,
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      credentialId: scope.credentialId,
      platform: scope.platform,
      state: 'planned',
      isDeleted: false,
    },
  });
  await admission.reauthorize(tx);
  if (!response?.outputPlanFingerprint) hold('response_unavailable');
  const output = await tx.breakoutResponseOutput.findFirst({
    where: {
      id: scope.outputId,
      responseId: scope.responseId,
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      credentialId: scope.credentialId,
      workflowExecutionId: admission.workflowExecutionId,
      isDeleted: false,
    },
  });
  await admission.reauthorize(tx);
  if (
    !output ||
    output.ordinal < 1 ||
    output.ordinal > 5 ||
    output.heldReason !== null ||
    !['generating', 'scheduled', 'publishing'].includes(output.state)
  )
    hold('output_unavailable');
  const source = await loadBreakoutPublication(tx, {
    organizationId: scope.organizationId,
    brandId: scope.brandId,
    credentialId: scope.credentialId,
    platform: scope.platform,
    postId: response.sourcePostId,
    nativeSourcePostId: response.nativeSourcePostId,
    externalId: response.externalId,
  });
  await admission.reauthorize(tx);
  if (
    !source ||
    source.isResponse ||
    source.logicalPostId !== response.logicalPostId ||
    source.contentDigest !== response.contentDigest ||
    source.publicationFingerprint !== response.publicationFingerprint
  )
    hold('source_changed');
  const trigger = await tx.breakoutBaselineReceipt.findFirst({
    where: {
      id: response.triggerReceiptId,
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      credentialId: scope.credentialId,
      platform: scope.platform,
      isDeleted: false,
    },
    select: { metric: true },
  });
  await admission.reauthorize(tx);
  if (
    !trigger ||
    (trigger.metric !== 'views' && trigger.metric !== 'impressions')
  )
    hold('growth_evidence_unavailable');
  const growth = await readBreakoutGrowth(tx, {
    source,
    metric: trigger.metric,
    nowMs,
  });
  await admission.reauthorize(tx);
  if (growth.status === 'held') hold(growth.reason);
}

async function assertCurrentQuality(
  tx: Prisma.TransactionClient,
  admission: BreakoutPublicationAdmission,
  content: string,
): Promise<string> {
  const { scope } = admission;
  const strategy = await tx.agentStrategy.findFirst({
    where: {
      id: admission.strategyId,
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      isDeleted: false,
      isActive: true,
    },
    select: { config: true, policies: true },
  });
  await admission.reauthorize(tx);
  if (!strategy) hold('strategy_unavailable');
  const policy = policySchema.safeParse({
    ...readRecord(strategy.config),
    ...readRecord(strategy.policies),
  });
  if (!policy.success || policy.data.isEnabled === false)
    hold('policy_unreadable');
  const binding = {
    responseId: scope.responseId,
    outputId: scope.outputId,
    postId: admission.postId,
    strategyId: admission.strategyId,
    workflowExecutionId: admission.workflowExecutionId,
    materialHash: hashBrandedGenerationTextV1(content),
  };
  const score = await tx.contentScore.findFirst({
    where: {
      organizationId: scope.organizationId,
      isDeleted: false,
      data: { path: ['breakoutQuality'], equals: binding },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  await admission.reauthorize(tx);
  const analysis = analysisSchema.safeParse(readRecord(score?.data));
  if (!score || !analysis.success || analysis.data.content !== content)
    hold('quality_evidence_unavailable');
  if (
    scoreTextPublishGate(policy.data, content, analysis.data).decision !==
    'approved'
  )
    hold('platform_quality_blocked');
  return score.id;
}
