import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import { toWorkflowActor } from '@api/authorization/brand-access/workflow-actor.util';
import { readOrganizationAutomationSettings } from '@api/collections/organization-settings/utils/organization-automation-settings.util';
import {
  buildBreakoutResponseExecutionRequest,
  denyBreakoutExecution,
} from '@api/collections/outliers/services/breakout-response-execution-admission.util';
import {
  BREAKOUT_RESPONSE_WORKFLOW_ID,
  BREAKOUT_RESPONSE_WORKFLOW_SOURCE,
} from '@api/collections/outliers/services/breakout-response-execution-workflow-definition';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { Platform } from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';

/** The committed detection an enqueue is for. Identity only; never carries authority. */
export type DetectedBreakoutSource = Readonly<{
  organizationId: string;
  brandId: string;
  credentialId: string;
  platform: Platform;
  externalId: string;
}>;

export type BreakoutResponseExecutionQueueDeps = Readonly<{
  prisma: Pick<
    PrismaService,
    'agentStrategy' | 'breakoutResponse' | 'organizationSetting'
  >;
  queue: Pick<WorkflowExecutionQueueService, 'queueSystemWorkflow'>;
  logger: Pick<LoggerService, 'warn'>;
}>;

/** Deterministic per response, so a retried or replayed enqueue joins the same job. */
export function breakoutResponseExecutionJobId(responseId: string): string {
  return `breakout-response-execute-${responseId}`;
}

/**
 * Hands a committed detection to the priority execution workflow. Call only after the
 * observation and detection transaction has committed, and only with the server-bound actor
 * of an authorized collection; an account without one never reaches this function.
 *
 * Returns the job id, or null when nothing is eligible to execute. An organization that has
 * not turned on breakout responses (#6526) never reaches the queue, so a detection costs it
 * nothing; the observation and the detection itself are already persisted and stay useful.
 */
export async function enqueueDetectedBreakoutResponse(
  deps: BreakoutResponseExecutionQueueDeps,
  actor: BrandAccessActor,
  source: DetectedBreakoutSource,
): Promise<string | null> {
  const initiatingActor = toWorkflowActor(actor, denyBreakoutExecution);
  if (initiatingActor.organizationId !== source.organizationId)
    denyBreakoutExecution();
  const settings = await readOrganizationAutomationSettings(
    deps.prisma,
    source.organizationId,
  );
  if (!settings.isBreakoutResponsesEnabled) return null;
  // Only a response still waiting for its plan; a planned one is owned by recovery.
  const response = await deps.prisma.breakoutResponse.findFirst({
    where: scopedWhere(source.organizationId, {
      brandId: source.brandId,
      credentialId: source.credentialId,
      platform: source.platform,
      externalId: source.externalId,
      state: 'detected',
    }),
    select: { id: true },
  });
  if (!response) return null;
  const strategies = await deps.prisma.agentStrategy.findMany({
    where: scopedWhere(source.organizationId, {
      brandId: source.brandId,
      isActive: true,
      platforms: { has: source.platform },
    }),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
    take: 2,
  });
  // Never guess which strategy's budget and policy govern the spend.
  if (strategies.length !== 1) {
    deps.logger.warn('Breakout response has no single governing strategy', {
      candidates: strategies.length,
      organizationId: source.organizationId,
      responseId: response.id,
    });
    return null;
  }
  const request = buildBreakoutResponseExecutionRequest(
    {
      brandId: source.brandId,
      credentialId: source.credentialId,
      organizationId: source.organizationId,
      platform: source.platform,
      responseId: response.id,
      strategyId: strategies[0].id,
    },
    initiatingActor,
  );
  return deps.queue.queueSystemWorkflow(
    {
      actionType: BREAKOUT_RESPONSE_WORKFLOW_ID,
      canonicalId: BREAKOUT_RESPONSE_WORKFLOW_ID,
      inputValues: { request },
      organizationId: request.organizationId,
      source: BREAKOUT_RESPONSE_WORKFLOW_SOURCE,
      userId: initiatingActor.userId,
    },
    breakoutResponseExecutionJobId(response.id),
    {
      // A retry would bind a second execution to already reserved outputs. Recovery is explicit.
      attempts: 1,
      dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
    },
  );
}

/**
 * The detection is already committed, so an enqueue failure must not fail the collection:
 * the next collection of the same post re-offers the still `detected` response.
 */
export async function enqueueDetectedBreakoutResponseAfterCommit(
  deps: BreakoutResponseExecutionQueueDeps,
  actor: BrandAccessActor,
  source: DetectedBreakoutSource,
): Promise<void> {
  try {
    await enqueueDetectedBreakoutResponse(deps, actor, source);
  } catch (error: unknown) {
    deps.logger.warn('Breakout response execution was not queued', {
      error: error instanceof Error ? error.message : String(error),
      organizationId: source.organizationId,
    });
  }
}
