import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { scopedWhere } from '@api/index';
import type { PostLifecycleService } from '@api/post-lifecycle/post-lifecycle.service';
import type { BatchItemFull } from '@api/services/batch-generation/batch-generation.types';
import { ReviewDecision, TargetExecutionState } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

/** Destination posts past these states cannot be withdrawn anymore. */
const SETTLED_STATES = new Set<string>([
  TargetExecutionState.CANCELLED,
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.PUBLISHING,
]);

/**
 * A review item's further destination posts (drafts a batch project
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
  item: BatchItemFull;
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
