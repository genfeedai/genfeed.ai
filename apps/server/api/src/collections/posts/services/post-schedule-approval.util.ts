import type { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { TargetExecutionState } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';

const PUBLISHABLE_EXECUTION_STATES = new Set<string>([
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PUBLISHING,
]);

export type ScheduledPublishPost = {
  id: string;
  organizationId: string;
  parentId?: string | null;
  scheduledDate?: Date | string | null;
  targetExecutionState?: string | null;
  userId?: string | null;
};

export type ScheduledPublishApprovalContext = {
  actorUserId?: string | null;
  post: ScheduledPublishPost;
  scheduledPostWorkflowQueue?: Pick<
    ScheduledPostWorkflowQueueService,
    'enqueue'
  >;
  provenanceSurface?: string;
  publishApprovalsService?: Pick<
    PublishApprovalsService,
    'createForCurrentPost'
  >;
};

export function needsScheduledPublishApproval(
  executionState: string | null | undefined,
): boolean {
  return PUBLISHABLE_EXECUTION_STATES.has(String(executionState ?? ''));
}

export function isScheduledPublishDueNow(
  scheduledDate: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!scheduledDate) {
    return true;
  }
  const resolved = new Date(scheduledDate);
  return (
    !Number.isNaN(resolved.getTime()) && resolved.getTime() <= now.getTime()
  );
}

/**
 * Every SCHEDULED / PUBLISHING write must mint a version-bound approval.
 * Due-now posts are enqueued immediately; future slots wait for the sweep.
 */
export async function bindScheduledPublishApproval(
  context: ScheduledPublishApprovalContext,
): Promise<void> {
  const { post } = context;
  if (post.parentId) {
    return;
  }
  if (!needsScheduledPublishApproval(post.targetExecutionState)) {
    return;
  }
  if (!context.publishApprovalsService) {
    throw new BadRequestException(
      'Scheduling a post requires the publish approval service.',
    );
  }
  const actorUserId = context.actorUserId || post.userId;
  if (!actorUserId) {
    throw new BadRequestException(
      'Scheduling a post requires an actor user id.',
    );
  }
  if (!post.organizationId) {
    throw new BadRequestException(
      'Scheduling a post requires an organization id.',
    );
  }

  const isDueNow = isScheduledPublishDueNow(post.scheduledDate);
  const approval = await context.publishApprovalsService.createForCurrentPost({
    actorUserId,
    mode: isDueNow ? 'immediate' : 'scheduled',
    organizationId: post.organizationId,
    postId: String(post.id),
    provenance: {
      surface: context.provenanceSurface ?? 'posts-service',
    },
  });

  if (!isDueNow) {
    return;
  }

  if (!context.scheduledPostWorkflowQueue) {
    return;
  }
  await context.scheduledPostWorkflowQueue.enqueue({
    approvalId: approval.id,
    operationId: approval.operationId,
    organizationId: post.organizationId,
    postId: String(post.id),
    source: 'publish_now',
    userId: actorUserId,
    versionPinId: approval.artifactVersionPinId,
  });
}
