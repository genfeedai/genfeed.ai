import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  type HiddenExecutionRef,
  type HiddenWorkflowRule,
  hiddenExecutionRef,
  validateHiddenExecutionChain,
} from '@api/authorization/brand-access/hidden-execution-chain.util';
import {
  parseWorkflowActor,
  refreshWorkflowActor,
  type WorkflowInitiatingActor,
} from '@api/authorization/brand-access/workflow-actor.util';
import {
  BREAKOUT_RESPONSE_WORKFLOW_ID,
  BREAKOUT_RESPONSE_WORKFLOW_SOURCE,
} from '@api/collections/outliers/services/breakout-response-execution-workflow-definition';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { assertApiKeyPublishingScope } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
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

const BREAKOUT_RESPONSE_RULE: HiddenWorkflowRule = {
  holderKey: 'request',
  matches: (canonicalId) => canonicalId === BREAKOUT_RESPONSE_WORKFLOW_ID,
  // Only the native producer's direct enqueue; never a child of another workflow.
  rootSources: [BREAKOUT_RESPONSE_WORKFLOW_SOURCE],
};

/**
 * Validates the hidden, tenant-pinned breakout execution (root, code-owned, version-pinned,
 * owned by the actor's user) and reads the request and actor it persisted. Nothing is read
 * from node or caller input.
 */
async function readPinnedBreakoutExecution(
  tx: Prisma.TransactionClient,
  ref: HiddenExecutionRef,
): Promise<BreakoutResponseExecutionAdmission> {
  const { actor, holder: persisted } = await validateHiddenExecutionChain(
    tx,
    ref,
    BREAKOUT_RESPONSE_RULE,
    { deny: denyBreakoutExecution },
  );
  const { organizationId } = ref;
  for (const key of SCOPE_KEYS) {
    if (!nonempty(persisted[key])) denyBreakoutExecution();
  }
  if (
    persisted.organizationId !== organizationId ||
    !isPlatform(persisted.platform)
  )
    denyBreakoutExecution();
  // A bound actor is mandatory; the self-hosted actorless allowance never applies here.
  if (actor === undefined) denyBreakoutExecution();
  return {
    initiatingActor: parseWorkflowActor(
      actor,
      organizationId,
      denyBreakoutExecution,
    ),
    scope: {
      brandId: persisted.brandId as string,
      credentialId: persisted.credentialId as string,
      organizationId,
      platform: persisted.platform as Platform,
      responseId: persisted.responseId as string,
      strategyId: persisted.strategyId as string,
    },
    workflowExecutionId: ref.executionId,
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
  const admission = await readPinnedBreakoutExecution(
    tx,
    hiddenExecutionRef(context, provenance, denyBreakoutExecution),
  );
  const supplied = record(incoming);
  for (const key of SCOPE_KEYS) {
    if (supplied[key] !== admission.scope[key]) denyBreakoutExecution();
  }
  await reauthorizeBreakoutActor(tx, policy, admission);
  return admission;
}

/**
 * Publication needs more than generation did: an API-key actor must still hold
 * `posts:schedule` or `posts:publish`, so a review-only key can draft but never publish.
 * Non-key actors are members whose brand access the live refresh already re-resolved.
 */
export async function reauthorizeBreakoutPublicationActor(
  tx: Prisma.TransactionClient,
  policy: BrandAccessService,
  admission: Pick<
    BreakoutResponseExecutionAdmission,
    'initiatingActor' | 'scope'
  >,
): Promise<void> {
  const actor = await reauthorizeBreakoutActor(tx, policy, admission);
  for (const capability of ['schedule', 'publish'] as const) {
    try {
      assertApiKeyPublishingScope(actor, capability);
      return;
    } catch (error: unknown) {
      if (!(error instanceof ForbiddenException)) throw error;
    }
  }
  denyBreakoutExecution();
}

/**
 * The publication fence's read of the generating execution: its validated scope and the actor
 * that was bound when the response was produced. A response whose execution carries no bound
 * actor is denied. This is not an authorization: the caller must run
 * `reauthorizeBreakoutPublicationActor` for whichever actor publishes (the generating actor
 * only when no human scheduled it).
 */
export async function readBreakoutPublicationAdmission(
  tx: Prisma.TransactionClient,
  executionId: string,
  organizationId: string,
): Promise<BreakoutResponseExecutionAdmission> {
  const execution = await tx.workflowExecution.findFirst({
    where: { id: executionId, organizationId, isDeleted: false },
    select: { userId: true, workflowId: true },
  });
  if (!execution) denyBreakoutExecution();
  return readPinnedBreakoutExecution(tx, {
    executionId,
    organizationId,
    userId: execution.userId,
    workflowId: execution.workflowId,
  });
}
