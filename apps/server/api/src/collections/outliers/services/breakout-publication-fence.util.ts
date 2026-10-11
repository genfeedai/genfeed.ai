import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { admitBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-admission.util';
import {
  admitBreakoutPublicationActor,
  reauthorizeBreakoutActor,
} from '@api/collections/outliers/services/breakout-response-execution-admission.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

function hold(reason: string): never {
  throw new BusinessLogicException(`Breakout publication held: ${reason}`);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
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
 * Publication fence for breakout response posts, run by the shared strategy scheduling
 * admission before a post may become SCHEDULED or PUBLISHING (every scheduling and dispatch
 * path already calls it, in the same transaction as the write).
 *
 * Authority is the actor pinned on the hidden execution that produced the response, re-read
 * live. A post whose execution has no bound actor, or whose actor lost its API key, membership
 * or brand access, is held, so a review-only account never publishes. Business evidence (current
 * growth, material approval, quality, quota) is `admitBreakoutPublication`, which receives that
 * same live check as its `reauthorize`.
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
  const phase =
    candidate.targetExecutionState === TargetExecutionState.PUBLISHING
      ? 'dispatch'
      : 'schedule';
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
      workflowExecutionId: true,
    },
  });
  const output = await tx.breakoutResponseOutput.findFirst({
    where: scopedWhere(organizationId, { id: outputId }),
    select: { responseId: true, brandId: true, credentialId: true },
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
    !post.workflowExecutionId ||
    post.brandId !== output.brandId ||
    post.credentialId !== output.credentialId ||
    post.platform !== response.platform
  )
    hold('publication_state_unavailable');
  const policy = new BrandAccessService(tx as unknown as PrismaService);
  const admission = await admitBreakoutPublicationActor(
    tx,
    policy,
    post.workflowExecutionId,
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
    reauthorize: async (client) => {
      await reauthorizeBreakoutActor(client, policy, admission);
    },
  });
}
