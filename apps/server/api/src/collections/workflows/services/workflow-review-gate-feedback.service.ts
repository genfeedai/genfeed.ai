import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { HarnessReviewFeedbackService } from '@api/services/harness/harness-review-feedback.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { normalizeReviewDecision, ReviewDecision } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

export interface WorkflowReviewGateDecisionInput {
  organizationId: string;
  executionId: string;
  nodeId: string;
  /** The human reviewer. Automatic (timeout) resolutions never reach here. */
  userId: string;
  isApproved: boolean;
  /** The caption the gate showed the reviewer, when it had one. */
  reviewedCaption: string | null;
  rejectionReason?: string;
}

/**
 * Feeds human workflow review-gate decisions into the same learning loops as
 * Turbo run reviews (#7340): the earned-autonomy streak per strategy and
 * platform, and the brand harness's anti-examples.
 *
 * A gate only counts when it gates the publish of an agent post: a post the
 * execution produced that carries a strategy and a platform. Anything else
 * (a digest email, a brief) has no streak to move, so nothing is recorded.
 *
 * Runs after the gate is resolved and must never undo or fail that decision;
 * failures are logged and swallowed.
 */
@Injectable()
export class WorkflowReviewGateFeedbackService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    @Optional()
    private readonly autonomousPublishPolicy?: AutonomousPublishPolicyService,
    @Optional()
    private readonly harnessReviewFeedback?: HarnessReviewFeedbackService,
  ) {}

  async recordDecision(input: WorkflowReviewGateDecisionInput): Promise<void> {
    try {
      await this.applyDecision(input);
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} failed to record review-gate feedback`,
        error,
        {
          executionId: input.executionId,
          nodeId: input.nodeId,
          organizationId: input.organizationId,
        },
      );
    }
  }

  private async applyDecision(
    input: WorkflowReviewGateDecisionInput,
  ): Promise<void> {
    const gatedPosts = await this.prisma.post.findMany({
      select: {
        brandId: true,
        description: true,
        id: true,
        reviewDecision: true,
      },
      where: scopedWhere(input.organizationId, {
        agentStrategyId: { not: null },
        platform: { not: null },
        workflowExecutionId: input.executionId,
      }),
    });
    if (gatedPosts.length === 0) return;

    const decision = input.isApproved
      ? ReviewDecision.APPROVED
      : ReviewDecision.REJECTED;
    // One key per gate decision, so a retried resolution never counts twice.
    const gateDecisionId = `workflow_review_gate:${input.executionId}:${input.nodeId}`;
    const autonomousPublishPolicy = this.autonomousPublishPolicy;

    if (autonomousPublishPolicy) {
      await this.prisma.$transaction(async (transaction) => {
        for (const post of gatedPosts) {
          await autonomousPublishPolicy.recordReviewDecision(
            {
              decision,
              // The gate approves the output as generated; it has no editor.
              generatedCaption: post.description,
              hasRewriteHistory: false,
              organizationId: input.organizationId,
              postId: post.id,
              previousDecision: normalizeReviewDecision(post.reviewDecision),
              userId: input.userId,
              versionPinId: gateDecisionId,
            },
            transaction,
          );
        }
      });
    }

    if (input.isApproved || !this.harnessReviewFeedback) return;
    const brandIds = [...new Set(gatedPosts.map((post) => post.brandId))];
    for (const brandId of brandIds) {
      const content =
        input.reviewedCaption ??
        gatedPosts.find((post) => post.brandId === brandId)?.description ??
        '';
      await this.harnessReviewFeedback.recordReviewDecision({
        brandId,
        content,
        decision,
        organizationId: input.organizationId,
        reason: input.rejectionReason,
        sourceId: `${input.executionId}:${input.nodeId}`,
        sourceType: 'workflow_review_gate',
      });
    }
  }
}
