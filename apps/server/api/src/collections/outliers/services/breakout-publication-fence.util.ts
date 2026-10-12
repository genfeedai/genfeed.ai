import {
  type BrandAccessActor,
  BrandAccessService,
} from '@api/authorization/brand-access/brand-access.service';
import { getRequestPrincipal } from '@api/authorization/brand-access/request-principal.context';
import {
  parseWorkflowActor,
  toWorkflowActor,
  type WorkflowInitiatingActor,
} from '@api/authorization/brand-access/workflow-actor.util';
import { readOrganizationAutomationSettings } from '@api/collections/organization-settings/utils/organization-automation-settings.util';
import {
  BREAKOUT_ORG_AUTO_PUBLISH_DISABLED_REASON,
  BREAKOUT_ORG_DISABLED_REASON,
  isBreakoutAutoPublishAllowed,
} from '@api/collections/outliers/services/breakout-organization-gate.util';
import { admitBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-admission.util';
import {
  type BreakoutResponseExecutionAdmission,
  denyBreakoutExecution,
  readBreakoutPublicationAdmission,
  reauthorizeBreakoutPublicationActor,
} from '@api/collections/outliers/services/breakout-response-execution-admission.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { TargetExecutionState } from '@genfeedai/contracts';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import type { PrismaService as LibsPrismaService } from '@libs/prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

type PublicationPhase = 'schedule' | 'dispatch';

function hold(reason: string): never {
  throw new BusinessLogicException(`Breakout publication held: ${reason}`);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** A breakout hold or an actor denial, as opposed to an infrastructure failure. */
export function isBreakoutPublicationHold(error: unknown): error is Error {
  return (
    error instanceof BusinessLogicException ||
    error instanceof ForbiddenException
  );
}

/**
 * Whether a post is a breakout response output. Any non-null link counts, so a malformed
 * value is held rather than treated as an ordinary post.
 */
export function isBreakoutPublicationCandidate(
  candidate: Readonly<Record<string, unknown>>,
): boolean {
  return (
    candidate.breakoutOutputId !== undefined &&
    candidate.breakoutOutputId !== null
  );
}

/**
 * Admits one breakout post for publication. Scope is pinned on the hidden execution that
 * generated the output (read from the output row, so a delivery restamping
 * `post.workflowExecutionId` never changes it). Authority is the publishing actor (see
 * `resolvePublishingActor`), re-read live on every check. Business evidence is
 * `admitBreakoutPublication`, which receives that same live check as its `reauthorize`.
 */
async function admitBreakoutPost(
  tx: Prisma.TransactionClient,
  target: Readonly<{
    organizationId: string;
    outputId: string;
    postId: string;
    phase: PublicationPhase;
  }>,
): Promise<void> {
  const { organizationId, outputId, postId, phase } = target;
  const post = await tx.post.findFirst({
    where: scopedWhere(organizationId, {
      id: postId,
      breakoutOutputId: outputId,
    }),
    select: {
      brandId: true,
      credentialId: true,
      platform: true,
      agentStrategyId: true,
    },
  });
  const output = await tx.breakoutResponseOutput.findFirst({
    where: scopedWhere(organizationId, { id: outputId }),
    select: {
      responseId: true,
      brandId: true,
      credentialId: true,
      workflowExecutionId: true,
      publicationActor: true,
    },
  });
  const response = output
    ? await tx.breakoutResponse.findFirst({
        where: scopedWhere(organizationId, {
          id: output.responseId,
          brandId: output.brandId,
          credentialId: output.credentialId,
        }),
        select: { platform: true },
      })
    : null;
  if (
    !post ||
    !output ||
    !response ||
    !post.agentStrategyId ||
    !output.workflowExecutionId ||
    post.brandId !== output.brandId ||
    post.credentialId !== output.credentialId ||
    post.platform !== response.platform
  )
    hold('publication_state_unavailable');
  // The organization's opt-ins (#6526), re-read in this transaction at schedule and at dispatch,
  // so turning breakout responses off holds an output already generated or scheduled.
  const settings = await readOrganizationAutomationSettings(tx, organizationId);
  if (!settings.isBreakoutResponsesEnabled) hold(BREAKOUT_ORG_DISABLED_REASON);
  const principal = getRequestPrincipal();
  // Without a signed-in member or key behind it and without a person who scheduled it, this is
  // an automatic publication, and only an organization that turned auto-publish on allows one.
  if (
    principal === undefined &&
    output.publicationActor === null &&
    !isBreakoutAutoPublishAllowed(settings)
  )
    hold(BREAKOUT_ORG_AUTO_PUBLISH_DISABLED_REASON);
  const policy = new BrandAccessService(tx as unknown as PrismaService);
  const generated = await readBreakoutPublicationAdmission(
    tx,
    output.workflowExecutionId,
    organizationId,
  );
  const { scope } = generated;
  if (
    scope.brandId !== output.brandId ||
    scope.credentialId !== output.credentialId ||
    scope.responseId !== output.responseId ||
    scope.platform !== response.platform ||
    scope.strategyId !== post.agentStrategyId
  )
    hold('actor_scope_changed');
  const admission = {
    initiatingActor: resolvePublishingActor(
      principal,
      output.publicationActor,
      generated,
    ),
    scope,
  };
  await reauthorizeBreakoutPublicationActor(tx, policy, admission);
  await admitBreakoutPublication(tx, {
    scope: {
      organizationId,
      brandId: output.brandId,
      credentialId: output.credentialId,
      platform: scope.platform,
      responseId: output.responseId,
      outputId,
    },
    strategyId: post.agentStrategyId,
    postId,
    workflowExecutionId: generated.workflowExecutionId,
    phase,
    reauthorize: (client) =>
      reauthorizeBreakoutPublicationActor(client, policy, admission),
  });
  // Remember who scheduled it, so dispatch (which has no request) re-checks that same person.
  if (principal)
    await tx.breakoutResponseOutput.updateMany({
      where: scopedWhere(organizationId, { id: outputId }),
      data: { publicationActor: toPrismaJson(admission.initiatingActor) },
    });
}

/**
 * Who publishes this output. A person or key scheduling it right now (the authenticated
 * request) is the authority, whatever generated the draft, so a human can publish what a
 * review-only key drafted. Without a request (a worker dispatching, a system path) it is the
 * last person who scheduled it, re-checked live, and otherwise only the generating actor.
 */
function resolvePublishingActor(
  principal: BrandAccessActor | undefined,
  scheduled: Prisma.JsonValue | null,
  generated: BreakoutResponseExecutionAdmission,
): WorkflowInitiatingActor {
  const { organizationId } = generated.scope;
  if (principal)
    return parseWorkflowActor(
      toWorkflowActor(principal, denyBreakoutExecution),
      organizationId,
      denyBreakoutExecution,
    );
  if (scheduled !== null)
    return parseWorkflowActor(scheduled, organizationId, denyBreakoutExecution);
  return generated.initiatingActor;
}

/**
 * Publication fence for the shared strategy scheduling admission: a breakout post may only
 * enter SCHEDULED or PUBLISHING while its pinned actor is live and its evidence is current.
 * Every scheduling write and every entry into PUBLISHING already calls that admission in
 * the same transaction as the write.
 *
 * A post that is already PUBLISHING is only being recorded or requeued (a provider outcome,
 * a retry): blocking those would strand an accepted publication. Its next entry into
 * PUBLISHING and its provider call are both fenced.
 */
export async function assertBreakoutPublicationFence(
  tx: Prisma.TransactionClient,
  candidate: Readonly<Record<string, unknown>>,
): Promise<void> {
  if (!isBreakoutPublicationCandidate(candidate)) return;
  const outputId = text(candidate.breakoutOutputId);
  const postId = text(candidate.id);
  const organizationId = text(candidate.organizationId);
  if (!outputId || !postId || !organizationId)
    hold('publication_state_unavailable');
  const current = await tx.post.findFirst({
    where: scopedWhere(organizationId, { id: postId }),
    select: { targetExecutionState: true },
  });
  if (current?.targetExecutionState === TargetExecutionState.PUBLISHING) return;
  await admitBreakoutPost(tx, {
    organizationId,
    outputId,
    postId,
    phase:
      candidate.targetExecutionState === TargetExecutionState.PUBLISHING
        ? 'dispatch'
        : 'schedule',
  });
}

/**
 * Dispatch fence for the worker: run immediately before the provider call, in a fresh
 * transaction. Ordinary posts pass untouched. A breakout post throws a hold (see
 * `isBreakoutPublicationHold`) and must then not reach the provider. The link is read from
 * the database, never from the caller's copy of the post.
 */
export async function assertBreakoutPublicationDispatch(
  prisma: Pick<LibsPrismaService, '$transaction'>,
  target: Readonly<{ organizationId: string; postId: string }>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const post = await tx.post.findFirst({
      where: scopedWhere(target.organizationId, { id: target.postId }),
      select: { breakoutOutputId: true },
    });
    if (!post) hold('publication_state_unavailable');
    if (post.breakoutOutputId === null) return;
    await admitBreakoutPost(tx, {
      ...target,
      outputId: post.breakoutOutputId,
      phase: 'dispatch',
    });
  });
}
