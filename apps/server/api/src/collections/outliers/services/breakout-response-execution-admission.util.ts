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

type PinnedExecutionQuery = Readonly<{
  executionId: string;
  organizationId: string;
  /** The running node's identity, when called from inside the action. */
  pin?: Readonly<{
    userId: string;
    workflowId: string;
    workflowVersionId: string;
  }>;
}>;

/**
 * Loads the server-persisted request of a hidden, tenant-pinned breakout execution and
 * validates the actor it carries. Nothing is read from node or caller input.
 */
async function readPinnedBreakoutExecution(
  tx: Prisma.TransactionClient,
  query: PinnedExecutionQuery,
): Promise<BreakoutResponseExecutionAdmission> {
  const { pin } = query;
  const execution = await tx.workflowExecution.findFirst({
    where: {
      id: query.executionId,
      organizationId: query.organizationId,
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
    (pin &&
      (execution.userId !== pin.userId ||
        execution.workflowId !== pin.workflowId ||
        execution.workflowVersionId !== pin.workflowVersionId)) ||
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
  for (const key of SCOPE_KEYS) {
    if (!nonempty(persisted[key])) denyBreakoutExecution();
  }
  if (
    persisted.organizationId !== query.organizationId ||
    !isPlatform(persisted.platform)
  )
    denyBreakoutExecution();
  // A bound actor is mandatory; the self-hosted actorless allowance never applies here.
  if (persisted.initiatingActor === undefined) denyBreakoutExecution();
  const captured = parseWorkflowActor(
    persisted.initiatingActor,
    query.organizationId,
    denyBreakoutExecution,
  );
  if (captured.userId !== execution.userId) denyBreakoutExecution();
  return {
    initiatingActor: captured,
    scope: {
      brandId: persisted.brandId as string,
      credentialId: persisted.credentialId as string,
      organizationId: query.organizationId,
      platform: persisted.platform as Platform,
      responseId: persisted.responseId as string,
      strategyId: persisted.strategyId as string,
    },
    workflowExecutionId: execution.id,
  };
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
  const admission = await readPinnedBreakoutExecution(tx, {
    executionId: provenance.executionId,
    organizationId: context.organizationId,
    pin: {
      userId: context.userId,
      workflowId: context.workflowId,
      workflowVersionId: context.workflowVersionId,
    },
  });
  const supplied = record(incoming);
  for (const key of SCOPE_KEYS) {
    if (supplied[key] !== admission.scope[key]) denyBreakoutExecution();
  }
  await reauthorizeBreakoutActor(tx, policy, admission);
  return admission;
}

/**
 * The publication fence's read of the same pinned execution: the actor that was bound when the
 * response was produced, re-checked live. A post whose execution carries no bound actor, or whose
 * actor lost its authority, is denied, so a review-only account can never publish.
 */
export async function admitBreakoutPublicationActor(
  tx: Prisma.TransactionClient,
  policy: BrandAccessService,
  executionId: string,
  organizationId: string,
): Promise<BreakoutResponseExecutionAdmission> {
  const admission = await readPinnedBreakoutExecution(tx, {
    executionId,
    organizationId,
  });
  await reauthorizeBreakoutActor(tx, policy, admission);
  return admission;
}
