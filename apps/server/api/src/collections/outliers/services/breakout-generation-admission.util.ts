import {
  runWithStrategyBudgetAttribution,
  type StrategyBudgetAttribution,
} from '@api/collections/credits/services/strategy-budget-attribution.context';
import { readBreakoutGrowth } from '@api/collections/outliers/services/breakout-growth.util';
import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { Platform } from '@genfeedai/contracts';
import { GENERATION_POOL_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import type { IReserveCreditsInput } from '@genfeedai/contracts/interfaces/billing';
import { Prisma } from '@genfeedai/prisma';

export type BreakoutGenerationAdmission = {
  scope: Readonly<StrategyBudgetAttribution>;
  credentialId: string;
  responseId: string;
  outputId: string;
  workflowExecutionId: string;
  actorUserId: string;
  /** The durable, server-derived component identity used by normal endpoint billing. */
  componentKey: string;
  /** Native closure verifies immutable execution proof and original/current actor constraints. */
  reauthorize: (tx: Prisma.TransactionClient) => Promise<void>;
};

function deny(reason: string): never {
  throw new BusinessLogicException(`Breakout generation held: ${reason}`);
}

/** Wraps the real endpoint/provider path; its normal credit producer invokes admission in its own transaction. */
export async function runWithBreakoutGenerationAdmission<T>(
  prisma: Prisma.TransactionClient,
  admission: Readonly<BreakoutGenerationAdmission>,
  generate: () => Promise<T>,
): Promise<T> {
  await admission.reauthorize(prisma);
  return runWithStrategyBudgetAttribution(
    prisma,
    admission.scope,
    async () => {
      await admission.reauthorize(prisma);
      return generate();
    },
    (tx, credits) => admitBreakoutGenerationCredits(tx, admission, credits),
  );
}

/** Called by the credit producer inside its serializable hold transaction, before provider work. */
export async function admitBreakoutGenerationCredits(
  tx: Prisma.TransactionClient,
  admission: Readonly<BreakoutGenerationAdmission>,
  credits: Readonly<IReserveCreditsInput>,
  nowMs = Date.now(),
): Promise<void> {
  const { scope } = admission;
  if (
    credits.organizationId !== scope.organizationId ||
    credits.brandId !== scope.brandId ||
    credits.actorUserId !== admission.actorUserId ||
    credits.workloadId !== admission.componentKey ||
    credits.idempotencyKey !==
      `${GENERATION_POOL_WORKLOAD_TYPE}:${admission.componentKey}` ||
    !Number.isFinite(credits.amount) ||
    credits.amount <= 0 ||
    credits.amount > Number.MAX_SAFE_INTEGER
  )
    deny('credit_scope_changed');
  await admitBreakoutGenerationContinuation(
    tx,
    admission,
    credits.amount,
    nowMs,
  );
}

/** Applies to every provider continuation, including a legitimately zero-credit BYOK dispatch. */
export async function admitBreakoutGenerationContinuation(
  tx: Prisma.TransactionClient,
  admission: Readonly<BreakoutGenerationAdmission>,
  requiredCredits = 0,
  nowMs = Date.now(),
): Promise<void> {
  if (
    !Number.isFinite(requiredCredits) ||
    requiredCredits < 0 ||
    requiredCredits > Number.MAX_SAFE_INTEGER
  )
    deny('credit_scope_changed');
  const { scope } = admission;
  await admission.reauthorize(tx);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "breakout_responses"
    WHERE "id" = ${admission.responseId}
      AND "organizationId" = ${scope.organizationId}
      AND "brandId" = ${scope.brandId}
      AND "credentialId" = ${admission.credentialId}
      AND "platform" = ${scope.platform} AND "isDeleted" = false FOR UPDATE
  `);
  await admission.reauthorize(tx);
  const response = await tx.breakoutResponse.findFirst({
    where: {
      id: admission.responseId,
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      credentialId: admission.credentialId,
      platform: scope.platform,
      isDeleted: false,
    },
  });
  await admission.reauthorize(tx);
  if (response?.state !== 'planned') deny('response_unavailable');
  const output = await tx.breakoutResponseOutput.findFirst({
    where: {
      id: admission.outputId,
      responseId: response.id,
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      credentialId: admission.credentialId,
      isDeleted: false,
    },
  });
  await admission.reauthorize(tx);
  if (
    !output ||
    output.format !== scope.format ||
    output.workflowExecutionId !== admission.workflowExecutionId ||
    (output.state !== 'reserved' && output.state !== 'generating') ||
    output.ordinal < 1 ||
    output.ordinal > 5 ||
    !admission.componentKey.startsWith(`${output.generationKey}:`)
  )
    deny('output_execution_changed');
  const execution = await tx.workflowExecution.findFirst({
    where: {
      id: admission.workflowExecutionId,
      organizationId: scope.organizationId,
      userId: admission.actorUserId,
      isDeleted: false,
    },
    select: { id: true },
  });
  await admission.reauthorize(tx);
  if (!execution) deny('execution_unavailable');
  const source = await loadBreakoutPublication(tx, {
    organizationId: scope.organizationId,
    brandId: scope.brandId,
    credentialId: admission.credentialId,
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
    deny('source_changed');
  if (
    (output.kind === 'quote' &&
      (scope.platform !== Platform.TWITTER ||
        scope.format !== 'text' ||
        output.ordinal !== 1)) ||
    (output.kind === 'follow_up' && scope.format !== source.format) ||
    (output.kind !== 'quote' && output.kind !== 'follow_up')
  )
    deny('output_plan_changed');
  const trigger = await tx.breakoutBaselineReceipt.findFirst({
    where: {
      id: response.triggerReceiptId,
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      credentialId: admission.credentialId,
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
    deny('growth_evidence_unavailable');
  const growth = await readBreakoutGrowth(tx, {
    source,
    metric: trigger.metric,
    nowMs,
  });
  await admission.reauthorize(tx);
  if (growth.status === 'held') deny(growth.reason);
  const capacity = await readBreakoutLiveCapacity(tx, {
    ...scope,
    credentialId: admission.credentialId,
    nowMs,
  });
  await admission.reauthorize(tx);
  if (capacity.status === 'held') deny(capacity.reason);
  if (capacity.remainingPublicationSlots === null) deny('quota_unavailable');
  if (capacity.remainingPublicationSlots < 1) deny('quota_exhausted');
  const { budget } = capacity;
  const remaining = [
    budget.remainingDailyCredits,
    budget.remainingWeeklyCredits,
    budget.remainingMonthlyCredits,
    budget.availableOrganizationCredits,
    budget.remainingPlatformCredits,
    budget.remainingPacingCredits,
    ...(budget.remainingFormatCredits[scope.format] !== undefined
      ? [budget.remainingFormatCredits[scope.format]]
      : []),
  ];
  if (remaining.some((value) => value === null || !Number.isFinite(value)))
    deny('budget_unavailable');
  if (
    remaining.some(
      (value) => typeof value === 'number' && requiredCredits > value,
    )
  )
    deny('budget_exhausted');
}
