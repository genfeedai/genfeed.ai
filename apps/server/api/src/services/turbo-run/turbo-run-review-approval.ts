import {
  InvalidChannelTargetScheduleException,
  toChannelTargetError,
} from '@api/collections/posts/services/channel-target-schedule-validation.util';
import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import type { AgentArtifactReferenceService } from '@api/index';
import { scopedWhere } from '@api/index';
import type { PostLifecycleService } from '@api/post-lifecycle/post-lifecycle.service';
import type { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import type {
  TurboRunItemFull,
  TurboRunWithConfig,
} from '@api/services/turbo-run/turbo-run.types';
import {
  AgentPublishDecision,
  PersistedReviewDecision,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPublishApproval } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

export function appendApprovedReviewEvent(
  item: TurboRunItemFull,
  reviewedAt: string,
  reviewerId: string,
  versionPinId?: string,
): void {
  item.reviewEvents = [
    ...(item.reviewEvents ?? []),
    {
      decision: ReviewDecision.APPROVED,
      reviewedAt,
      reviewerId,
      ...(versionPinId ? { versionPinId } : {}),
    },
  ];
}

export async function pinApprovedDrafts(input: {
  agentArtifactReferenceService: AgentArtifactReferenceService;
  autonomous: boolean;
  autonomousPublishPolicy: AutonomousPublishPolicyService;
  turboRunId: string;
  turboRunItems: TurboRunItemFull[];
  turboRunRecord: TurboRunWithConfig;
  createdByUserId: string;
  expectedPostVersions?: Record<string, string>;
  orgId: string;
  publishApprovalsService: PublishApprovalsService;
  selectedPostIds: string[];
  transaction: Prisma.TransactionClient;
  assertExpectedPostVersion: (
    postId: string,
    updatedAt: Date,
    expected?: Record<string, string>,
  ) => void;
}): Promise<{
  publishApprovals: Map<string, IPublishApproval>;
  versionPinIds: Map<string, string>;
}> {
  const versionPinIds = new Map<string, string>();
  const publishApprovals = new Map<string, IPublishApproval>();
  for (const postId of input.selectedPostIds) {
    const item = input.turboRunItems.find(
      (candidate) => candidate.postId === postId,
    );
    const post = await input.transaction.post.findFirst({
      where: scopedWhere(input.orgId, {
        id: postId,
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    });
    if (!post)
      throw new BadRequestException('Only a current draft can be approved');
    input.assertExpectedPostVersion(
      post.id,
      post.updatedAt,
      input.expectedPostVersions,
    );
    if (input.autonomous) {
      const policy = await input.autonomousPublishPolicy.resolveForPost(
        { organizationId: input.orgId, postId },
        input.transaction,
      );
      if (
        policy.result.decision !== AgentPublishDecision.PERMITTED ||
        !item?.scheduledDate ||
        !post.credentialId
      )
        throw new BadRequestException(
          'Autonomous publication requires explicit policy, destination and schedule',
        );
    }
    if (item && !input.autonomous)
      await input.autonomousPublishPolicy.recordReviewDecision(
        {
          organizationId: input.orgId,
          postId,
          userId: input.createdByUserId,
          decision: ReviewDecision.APPROVED,
          previousDecision: item.reviewDecision,
          generatedCaption: item.caption,
          hasRewriteHistory: Boolean(item.reviewEvents?.length),
        },
        input.transaction,
      );
    if (item?.scheduledDate) {
      const approval = await input.publishApprovalsService.createForCurrentPost(
        {
          actorUserId: input.createdByUserId,
          mode: 'scheduled',
          organizationId: input.orgId,
          postId,
          provenance: {
            turboRunId: input.turboRunId,
            reviewItemId: item.id,
            surface: 'review-queue',
          },
          transaction: input.transaction,
        },
      );
      publishApprovals.set(postId, approval);
      versionPinIds.set(postId, approval.artifactVersionPinId);
    } else {
      const versionPin =
        await input.agentArtifactReferenceService.createOrReuseVersionPin({
          createdByUserId: input.createdByUserId,
          reference: {
            ...(input.turboRunRecord.brandId
              ? { brandId: input.turboRunRecord.brandId }
              : {}),
            kind: 'post',
            organizationId: input.orgId,
            recordId: postId,
            serializer: 'post',
          },
          transaction: input.transaction,
        });
      versionPinIds.set(postId, versionPin.id);
    }
  }
  return { publishApprovals, versionPinIds };
}

/**
 * Transition one approved review item's post to SCHEDULED. Approving a run
 * approves every selected item in one call, so one item's content failing
 * the channel contract (#5193) — media the chosen platform can't take, a
 * caption that no longer fits — must not undo the approval decision recorded
 * for the rest: this fails just that item's post (to FAILED) instead of the
 * whole run.
 */
export async function scheduleApprovedReviewPost(input: {
  turboRunId: string;
  createdByUserId: string;
  logger: Pick<LoggerService, 'error' | 'warn'>;
  orgId: string;
  postId: string;
  postLifecycleService: Pick<PostLifecycleService, 'transition'>;
  reviewedAt: string;
  transaction: Prisma.TransactionClient;
  versionPinId?: string;
}): Promise<void> {
  try {
    await input.postLifecycleService.transition(
      {
        actorId: input.createdByUserId,
        mutation: {
          reviewDecision: PersistedReviewDecision.APPROVED,
          reviewVersionPinId: input.versionPinId,
          reviewedAt: new Date(input.reviewedAt),
        },
        nextState: TargetExecutionState.SCHEDULED,
        organizationId: input.orgId,
        postId: input.postId,
        reason: 'Review item approved for scheduling',
      },
      input.transaction,
    );
  } catch (error: unknown) {
    if (!(error instanceof InvalidChannelTargetScheduleException)) {
      throw error;
    }
    input.logger.warn('Approved review item failed channel validation', {
      turboRunId: input.turboRunId,
      error: error.message,
      orgId: input.orgId,
      postId: input.postId,
    });
    try {
      await input.postLifecycleService.transition(
        {
          actorId: input.createdByUserId,
          error: toChannelTargetError(error.validation),
          mutation: {
            reviewDecision: PersistedReviewDecision.APPROVED,
            reviewVersionPinId: input.versionPinId,
            reviewedAt: new Date(input.reviewedAt),
          },
          nextState: TargetExecutionState.FAILED,
          organizationId: input.orgId,
          postId: input.postId,
          reason: 'Channel target failed validation while approving',
        },
        input.transaction,
      );
    } catch (recoveryError: unknown) {
      input.logger.error(
        'Failed to record channel validation failure on review item',
        {
          turboRunId: input.turboRunId,
          error: recoveryError,
          orgId: input.orgId,
          postId: input.postId,
        },
      );
    }
  }
}
