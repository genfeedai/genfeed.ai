import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  parseWorkflowActor,
  refreshWorkflowActor,
  type WorkflowInitiatingActor,
} from '@api/authorization/brand-access/workflow-actor.util';
import {
  BREAKOUT_RESPONSE_WORKFLOW_ID,
  BREAKOUT_RESPONSE_WORKFLOW_SOURCE,
} from '@api/collections/outliers/services/breakout-response-execution-workflow-definition';
import {
  getSystemWorkflowMetadata,
  isHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { isPlatform, type Platform } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ForbiddenException } from '@nestjs/common';

/** Scope of one detected response. The actor is deliberately not part of it. */
export type BreakoutResponseExecutionScope = Readonly<{
  organizationId: string;
  brandId: string;
  credentialId: string;
  platform: Platform;
  responseId: string;
  strategyId: string;
}>;

export type BreakoutResponseExecutionAdmission = Readonly<{
  scope: BreakoutResponseExecutionScope;
  /** Persisted, validated actor. Live authority is re-read by `reauthorizeBreakoutActor`. */
  initiatingActor: WorkflowInitiatingActor;
  workflowExecutionId: string;
}>;

const SCOPE_KEYS = [
  'brandId',
  'credentialId',
  'organizationId',
  'platform',
  'responseId',
  'strategyId',
] as const;

export function denyBreakoutExecution(): never {
  throw new ForbiddenException('Breakout execution denied');
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The persisted request carries the actor; every other field is the closed scope. */
export function buildBreakoutResponseExecutionRequest(
  scope: BreakoutResponseExecutionScope,
  initiatingActor: WorkflowInitiatingActor,
) {
  return {
    brandId: scope.brandId,
    credentialId: scope.credentialId,
    initiatingActor,
    organizationId: scope.organizationId,
    platform: scope.platform,
    responseId: scope.responseId,
    strategyId: scope.strategyId,
  };
}

/**
 * Re-reads live authority for the persisted actor: API key, membership and access to this
 * brand. A bound actor is mandatory, so the self-hosted actorless allowance does not apply.
 */
export async function reauthorizeBreakoutActor(
  tx: Prisma.TransactionClient,
  policy: BrandAccessService,
  admission: Pick<
    BreakoutResponseExecutionAdmission,
    'initiatingActor' | 'scope'
  >,
): Promise<WorkflowInitiatingActor> {
  const { scope } = admission;
  const actor = await refreshWorkflowActor(
    tx,
    policy,
    admission.initiatingActor,
    scope.organizationId,
    denyBreakoutExecution,
  );
  if (!actor || actor.userId !== admission.initiatingActor.userId)
    denyBreakoutExecution();
  await policy.assert(actor, scope.brandId, tx);
  return actor;
}

/**
 * Reads authority only from the server-persisted, pinned hidden execution. The node's scope
 * fields must equal the persisted ones; anything else it carries, including an actor, is ignored.
 */
export async function admitBreakoutResponseExecution(
  tx: Prisma.TransactionClient,
  policy: BrandAccessService,
  action: SystemWorkflowActionRequest,
  incoming: unknown,
): Promise<BreakoutResponseExecutionAdmission> {
  const { context, provenance } = action;
  if (
    !context.organizationId ||
    !context.userId ||
    provenance.executionId !== (context.executionId ?? context.runId) ||
    provenance.workflowId !== context.workflowId
  )
    denyBreakoutExecution();
  const execution = await tx.workflowExecution.findFirst({
    where: {
      id: provenance.executionId,
      organizationId: context.organizationId,
      isDeleted: false,
    },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      workflowId: true,
      workflowVersionId: true,
      result: true,
      workflow: {
        select: {
          isDeleted: true,
          organizationId: true,
          userId: true,
          metadata: true,
        },
      },
      workflowVersion: {
        select: { workflowId: true, organizationId: true, userId: true },
      },
    },
  });
  if (
    !execution ||
    execution.userId !== context.userId ||
    execution.workflowId !== context.workflowId ||
    execution.workflowVersionId !== context.workflowVersionId ||
    execution.workflow.isDeleted ||
    execution.workflow.organizationId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    execution.workflow.userId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    execution.workflowVersion.organizationId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    execution.workflowVersion.userId !== SYSTEM_WORKFLOW_PRINCIPAL_ID ||
    execution.workflowVersion.workflowId !== execution.workflowId ||
    !isHiddenSystemWorkflowMetadata(execution.workflow.metadata) ||
    getSystemWorkflowMetadata(execution.workflow.metadata)?.canonicalId !==
      BREAKOUT_RESPONSE_WORKFLOW_ID
  )
    denyBreakoutExecution();
  const result = record(execution.result);
  const metadata = record(result.metadata);
  // Only the native producer's direct enqueue; never a child of another workflow.
  if (
    metadata.canonicalId !== BREAKOUT_RESPONSE_WORKFLOW_ID ||
    metadata.source !== BREAKOUT_RESPONSE_WORKFLOW_SOURCE ||
    metadata.parentExecutionId !== undefined
  )
    denyBreakoutExecution();
  const persisted = record(record(result.inputValues).request);
  const supplied = record(incoming);
  for (const key of SCOPE_KEYS) {
    if (!nonempty(persisted[key]) || supplied[key] !== persisted[key])
      denyBreakoutExecution();
  }
  if (
    persisted.organizationId !== context.organizationId ||
    !isPlatform(persisted.platform)
  )
    denyBreakoutExecution();
  if (persisted.initiatingActor === undefined) denyBreakoutExecution();
  const captured = parseWorkflowActor(
    persisted.initiatingActor,
    context.organizationId,
    denyBreakoutExecution,
  );
  if (captured.userId !== context.userId) denyBreakoutExecution();
  const scope: BreakoutResponseExecutionScope = {
    brandId: persisted.brandId as string,
    credentialId: persisted.credentialId as string,
    organizationId: context.organizationId,
    platform: persisted.platform as Platform,
    responseId: persisted.responseId as string,
    strategyId: persisted.strategyId as string,
  };
  const admission = {
    initiatingActor: captured,
    scope,
    workflowExecutionId: execution.id,
  } as const;
  await reauthorizeBreakoutActor(tx, policy, admission);
  return admission;
}
