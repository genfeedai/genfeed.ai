import { WorkflowReviewGateFeedbackService } from '@api/collections/workflows/services/workflow-review-gate-feedback.service';
import type { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import type { HarnessReviewFeedbackService } from '@api/services/harness/harness-review-feedback.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ReviewDecision } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const baseInput = {
  executionId: 'exec-1',
  isApproved: true,
  nodeId: 'gate-1',
  organizationId: 'org-1',
  reviewedCaption: 'Reviewed caption',
  userId: 'user-1',
};

describe('WorkflowReviewGateFeedbackService', () => {
  const transaction = { marker: 'tx' };
  const prisma = {
    $transaction: vi.fn(),
    post: { findMany: vi.fn() },
  };
  const logger = { error: vi.fn() };
  const policy = { recordReviewDecision: vi.fn() };
  const harness = { recordReviewDecision: vi.fn() };
  let service: WorkflowReviewGateFeedbackService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (run: (tx: typeof transaction) => Promise<void>) =>
        run(transaction),
    );
    prisma.post.findMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        description: 'Post caption',
        id: 'post-1',
        reviewDecision: null,
      },
    ]);
    service = new WorkflowReviewGateFeedbackService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
      policy as unknown as AutonomousPublishPolicyService,
      harness as unknown as HarnessReviewFeedbackService,
    );
  });

  it('counts an approval toward the streak of each gated agent post', async () => {
    await service.recordDecision(baseInput);

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          agentStrategyId: { not: null },
          isDeleted: false,
          organizationId: 'org-1',
          platform: { not: null },
          workflowExecutionId: 'exec-1',
        },
      }),
    );
    expect(policy.recordReviewDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: ReviewDecision.APPROVED,
        generatedCaption: 'Post caption',
        hasRewriteHistory: false,
        organizationId: 'org-1',
        postId: 'post-1',
        userId: 'user-1',
        versionPinId: 'workflow_review_gate:exec-1:gate-1',
      }),
      transaction,
    );
    expect(harness.recordReviewDecision).not.toHaveBeenCalled();
  });

  it('records a rejection in the streak and the brand harness', async () => {
    await service.recordDecision({
      ...baseInput,
      isApproved: false,
      rejectionReason: 'Too salesy',
    });

    expect(policy.recordReviewDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: ReviewDecision.REJECTED }),
      transaction,
    );
    expect(harness.recordReviewDecision).toHaveBeenCalledWith({
      brandId: 'brand-1',
      content: 'Reviewed caption',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      reason: 'Too salesy',
      sourceId: 'exec-1:gate-1',
      sourceType: 'workflow_review_gate',
    });
  });

  it('leaves the streak unchanged when the gate gates no agent post', async () => {
    prisma.post.findMany.mockResolvedValue([]);

    await service.recordDecision({ ...baseInput, isApproved: false });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(policy.recordReviewDecision).not.toHaveBeenCalled();
    expect(harness.recordReviewDecision).not.toHaveBeenCalled();
  });

  it('never fails the resolved gate when feedback recording fails', async () => {
    policy.recordReviewDecision.mockRejectedValue(new Error('db down'));

    await expect(service.recordDecision(baseInput)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
