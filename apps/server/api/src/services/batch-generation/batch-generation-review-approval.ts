import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import type { AgentArtifactReferenceService } from '@api/index';
import { scopedWhere } from '@api/index';
import type { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import type {
  BatchItemFull,
  BatchWithConfig,
} from '@api/services/batch-generation/batch-generation.types';
import {
  AgentPublishDecision,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPublishApproval } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';

export function appendApprovedReviewEvent(
  item: BatchItemFull,
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
  batchId: string;
  batchItems: BatchItemFull[];
  batchRecord: BatchWithConfig;
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
    const item = input.batchItems.find(
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
            batchId: input.batchId,
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
            ...(input.batchRecord.brandId
              ? { brandId: input.batchRecord.brandId }
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
