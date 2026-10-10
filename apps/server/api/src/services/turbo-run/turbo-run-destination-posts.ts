import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import type { PostLifecycleService } from '@api/post-lifecycle/post-lifecycle.service';
import type { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import {
  resolveTurboRunItems,
  type TurboRunItemFull,
  type TurboRunWithConfig,
} from '@api/services/turbo-run/turbo-run.types';
import { writeTurboRunJsonAndItemRows } from '@api/services/turbo-run/turbo-run-item-rows';
import {
  PersistedReviewDecision,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

/** Destination posts past these states cannot be withdrawn anymore. */
const SETTLED_STATES = new Set<string>([
  TargetExecutionState.CANCELLED,
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.PUBLISHING,
]);

/**
 * A review item's further destination posts (drafts a Turbo project
 * schedules on other accounts) carry its approval too. When the reviewer
 * rejects, requests changes or rewrites the item, every one not yet
 * published loses its publish approval with the canonical post: back to
 * draft, or cancelled when rejected.
 */
export async function withdrawDestinationPosts(input: {
  actorUserId?: string;
  decision:
    | typeof ReviewDecision.REJECTED
    | typeof ReviewDecision.REQUEST_CHANGES;
  item: TurboRunItemFull;
  organizationId: string;
  postLifecycleService: PostLifecycleService;
  publishApprovalsService: PublishApprovalsService;
  reason: string;
  transaction: Prisma.TransactionClient;
}): Promise<void> {
  const { item, organizationId, transaction } = input;
  for (const postId of item.destinationPostIds ?? []) {
    if (postId === item.postId) {
      continue;
    }
    const post = await transaction.post.findFirst({
      select: { id: true, targetExecutionState: true },
      where: scopedWhere(organizationId, { id: postId }),
    });
    if (!post || SETTLED_STATES.has(String(post.targetExecutionState))) {
      continue;
    }
    await input.publishApprovalsService.invalidatePost(
      organizationId,
      post.id,
      input.reason,
      input.actorUserId,
      transaction,
    );
    const isRejected = input.decision === ReviewDecision.REJECTED;
    await input.postLifecycleService.transition(
      {
        actorId: input.actorUserId,
        ...(isRejected ? { mutation: { isDeleted: true } } : {}),
        nextState: isRejected
          ? TargetExecutionState.CANCELLED
          : TargetExecutionState.DRAFT,
        organizationId,
        postId: post.id,
        reason: input.reason,
      },
      transaction,
    );
  }
}

/** Extend destination lineage while the caller holds the run row lock. */
export async function linkReviewDestinationPosts(
  transaction: Prisma.TransactionClient,
  turboRun: TurboRunWithConfig,
  itemId: string,
  postIds: string[],
  organizationId: string,
): Promise<void> {
  const items = resolveTurboRunItems(turboRun);
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new NotFoundException('Turbo run item', itemId);
  }
  const linked = new Set(item.destinationPostIds ?? []);
  const fresh = postIds.filter(
    (postId) => postId !== item.postId && !linked.has(postId),
  );
  if (fresh.length === 0) {
    return;
  }
  item.destinationPostIds = [...linked, ...fresh];
  await writeTurboRunJsonAndItemRows(transaction, {
    turboRunId: turboRun.id,
    brandId: turboRun.brandId,
    items,
    organizationId,
  });
}

/** Apply a declined review to the canonical post inside the run transaction. */
export async function declineReviewPost(input: {
  actorUserId?: string;
  autonomousPublishPolicy: AutonomousPublishPolicyService;
  decision:
    | typeof ReviewDecision.REJECTED
    | typeof ReviewDecision.REQUEST_CHANGES;
  feedback?: string;
  item: TurboRunItemFull;
  organizationId: string;
  postId: string;
  postLifecycleService: PostLifecycleService;
  publishApprovalsService: PublishApprovalsService;
  reviewedAt: string;
  transaction: Prisma.TransactionClient;
  userId: string;
}): Promise<void> {
  const {
    actorUserId,
    decision,
    feedback,
    item,
    organizationId,
    postId,
    reviewedAt,
    transaction,
  } = input;
  await input.autonomousPublishPolicy.recordReviewDecision(
    {
      organizationId,
      postId,
      userId: actorUserId ?? input.userId,
      decision,
      previousDecision: item.reviewDecision,
      generatedCaption: item.caption,
      hasRewriteHistory: Boolean(item.reviewEvents?.length),
    },
    transaction,
  );
  await input.publishApprovalsService.invalidatePost(
    organizationId,
    postId,
    feedback ?? 'Review declined publication',
    actorUserId,
    transaction,
  );
  await input.postLifecycleService.transition(
    {
      actorId: actorUserId,
      organizationId,
      postId,
      nextState:
        decision === ReviewDecision.REJECTED
          ? TargetExecutionState.CANCELLED
          : TargetExecutionState.DRAFT,
      mutation: {
        isDeleted: decision === ReviewDecision.REJECTED,
        reviewDecision:
          decision === ReviewDecision.REJECTED
            ? PersistedReviewDecision.REJECTED
            : PersistedReviewDecision.REQUEST_CHANGES,
        reviewedAt: new Date(reviewedAt),
        reviewFeedback: feedback,
      },
      reason: feedback ?? 'Review declined publication',
    },
    transaction,
  );
}
