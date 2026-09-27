import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import type { PostLifecycleService } from '@api/post-lifecycle/post-lifecycle.service';
import type { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import {
  type BatchItemFull,
  type BatchWithConfig,
  resolveBatchItems,
} from '@api/services/batch-generation/batch-generation.types';
import { writeBatchJsonAndItemRows } from '@api/services/batch-generation/batch-item-rows';
import {
  ReviewDecision,
  TargetExecutionState,
  toPersistedReviewDecision,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';

type RewriteCollaborators = {
  autonomousPublishPolicy: AutonomousPublishPolicyService;
  organizationId: string;
  postLifecycleService: PostLifecycleService;
  postVersions: Map<string, Date>;
  publishApprovalsService: PublishApprovalsService;
  transaction: Prisma.TransactionClient;
  userId: string;
};

export function assertExpectedPostSet(
  items: BatchItemFull[],
  itemIds: string[],
  expected?: Record<string, string>,
): void {
  if (!expected) return;
  const selected = items.filter((item) => itemIds.includes(item.id));
  if (
    selected.length !== new Set(itemIds).size ||
    selected.some(
      (item) => !item.postId || !Object.hasOwn(expected, item.postId),
    )
  ) {
    throw new BadRequestException(
      'This review action no longer refers to the expected draft',
    );
  }
}

export function assertExpectedPostVersion(
  postId: string,
  updatedAt: Date,
  expected?: Record<string, string>,
): void {
  if (
    expected &&
    (!Object.hasOwn(expected, postId) ||
      updatedAt.toISOString() !== expected[postId])
  ) {
    throw new BadRequestException(
      'This review action refers to an older draft version',
    );
  }
}

async function applyPostRewrite({
  autonomousPublishPolicy,
  caption,
  item,
  organizationId,
  postLifecycleService,
  postVersions,
  publishApprovalsService,
  reviewedAt,
  transaction,
  userId,
}: RewriteCollaborators & {
  caption: string;
  item: BatchItemFull;
  reviewedAt: string;
}): Promise<void> {
  if (item.postId) {
    const post = await transaction.post.findFirst({
      where: { id: item.postId, organizationId, isDeleted: false },
    });
    if (
      !post ||
      post.updatedAt.getTime() !== postVersions.get(item.postId)?.getTime()
    ) {
      throw new ConflictException(
        'Post changed during rewrite. Refresh and try again.',
      );
    }
    await autonomousPublishPolicy.recordReviewDecision(
      {
        organizationId,
        postId: item.postId,
        userId,
        decision: ReviewDecision.REQUEST_CHANGES,
        previousDecision: item.reviewDecision,
        generatedCaption: item.caption,
        hasRewriteHistory: true,
      },
      transaction,
    );
    await publishApprovalsService.invalidatePost(
      organizationId,
      item.postId,
      'Content rewritten',
      userId,
      transaction,
    );
    const transition = await postLifecycleService.transition(
      {
        actorId: userId,
        organizationId,
        postId: item.postId,
        nextState: TargetExecutionState.DRAFT,
        mutation: {
          description: caption,
          reviewFeedback: null,
          reviewVersionPinId: null,
          reviewDecision: toPersistedReviewDecision(ReviewDecision.UNSET),
          reviewedAt: new Date(reviewedAt),
        },
        reason: 'Content rewritten',
      },
      transaction,
    );
    if (transition.kind === 'stale') {
      throw new ConflictException(
        'Post changed during rewrite. Refresh and try again.',
      );
    }
  }
}

export async function applyBatchRewrites({
  autonomousPublishPolicy,
  batch,
  batchId,
  captions,
  organizationId,
  postLifecycleService,
  postVersions,
  publishApprovalsService,
  transaction,
  userId,
}: RewriteCollaborators & {
  batch: BatchWithConfig;
  batchId: string;
  captions: Map<string, string>;
}): Promise<BatchWithConfig> {
  const items = resolveBatchItems(batch);
  const reviewedAt = new Date().toISOString();
  for (const item of items) {
    const caption = captions.get(item.id);
    if (caption === undefined) continue;
    await applyPostRewrite({
      autonomousPublishPolicy,
      caption,
      item,
      organizationId,
      postLifecycleService,
      postVersions,
      publishApprovalsService,
      reviewedAt,
      transaction,
      userId,
    });
    item.caption = caption;
    item.reviewDecision = ReviewDecision.UNSET;
    item.reviewFeedback = undefined;
    item.reviewedAt = reviewedAt;
    item.versionPinId = undefined;
    item.publishApproval = undefined;
    item.reviewEvents = [
      ...(item.reviewEvents ?? []),
      {
        decision: ReviewDecision.REQUEST_CHANGES,
        feedback: 'Content rewritten',
        reviewedAt,
        reviewerId: userId,
      },
    ];
  }
  await writeBatchJsonAndItemRows(transaction, {
    batchId,
    brandId: batch.brandId,
    items,
    organizationId,
  });
  return { ...batch, items };
}
