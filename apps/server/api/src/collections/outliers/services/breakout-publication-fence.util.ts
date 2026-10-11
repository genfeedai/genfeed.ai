import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { admitBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-admission.util';
import {
  admitBreakoutPublicationActor,
  reauthorizeBreakoutPublicationActor,
} from '@api/collections/outliers/services/breakout-response-execution-admission.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
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
 * Admits one breakout post for publication. Authority is the actor pinned on the hidden
 * execution that generated the output (read from the output row, so a delivery restamping
 * `post.workflowExecutionId` never changes it), re-read live on every check. Business
 * evidence is `admitBreakoutPublication`, which receives that same live check as its
 * `reauthorize`.
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
  const policy = new BrandAccessService(tx as unknown as PrismaService);
  const admission = await admitBreakoutPublicationActor(
    tx,
    policy,
    output.workflowExecutionId,
    organizationId,
  );
  const { scope } = admission;
  if (
    scope.brandId !== output.brandId ||
    scope.credentialId !== output.credentialId ||
    scope.responseId !== output.responseId ||
    scope.platform !== response.platform ||
    scope.strategyId !== post.agentStrategyId
  )
    hold('actor_scope_changed');
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
    workflowExecutionId: admission.workflowExecutionId,
    phase,
    reauthorize: (client) =>
      reauthorizeBreakoutPublicationActor(client, policy, admission),
  });
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
