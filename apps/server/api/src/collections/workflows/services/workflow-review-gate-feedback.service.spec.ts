import { WorkflowReviewGateFeedbackService } from '@api/collections/workflows/services/workflow-review-gate-feedback.service';
import type { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import type { HarnessReviewFeedbackService } from '@api/services/harness/harness-review-feedback.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ReviewDecision } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface PostRow {
  agentStrategyId: string | null;
  brandId: string;
  description: string;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  platform: string | null;
  reviewDecision: string | null;
  workflowExecutionId: string;
}

function post(id: string, overrides: Partial<PostRow> = {}): PostRow {
  return {
    agentStrategyId: 'strategy-1',
    brandId: 'brand-1',
    description: `Caption ${id}`,
    id,
    isDeleted: false,
    organizationId: 'org-1',
    platform: 'twitter',
    reviewDecision: null,
    workflowExecutionId: 'exec-1',
    ...overrides,
  };
}

function matches(row: PostRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, filter]) => {
    const value = (row as unknown as Record<string, unknown>)[key];
    return filter && typeof filter === 'object' && 'not' in filter
      ? value !== (filter as { not: unknown }).not
      : value === filter;
  });
}

const baseInput = {
  executionId: 'exec-1',
  isApproved: true,
  nodeId: 'gate-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

describe('WorkflowReviewGateFeedbackService', () => {
  let posts: PostRow[];
  let transactions: number;
  let streakDecisions: Array<{
    input: Record<string, unknown>;
    transaction: number;
  }>;
  let harnessDecisions: Array<Record<string, unknown>>;
  let errors: string[];
  let isStreakStoreDown: boolean;
  let service: WorkflowReviewGateFeedbackService;

  beforeEach(() => {
    posts = [post('post-1')];
    transactions = 0;
    streakDecisions = [];
    harnessDecisions = [];
    errors = [];
    isStreakStoreDown = false;

    const prisma = {
      $transaction: async (run: (transaction: number) => Promise<void>) => {
        transactions += 1;
        return run(transactions);
      },
      post: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          posts.filter((row) => matches(row, where)),
      },
    };

    service = new WorkflowReviewGateFeedbackService(
      prisma as unknown as PrismaService,
      {
        error: (message: string) => {
          errors.push(message);
        },
      } as unknown as LoggerService,
      {
        recordReviewDecision: async (
          input: Record<string, unknown>,
          transaction: number,
        ) => {
          if (isStreakStoreDown) {
            throw new Error('db down');
          }
          streakDecisions.push({ input, transaction });
        },
      } as unknown as AutonomousPublishPolicyService,
      {
        recordReviewDecision: async (input: Record<string, unknown>) => {
          harnessDecisions.push(input);
        },
      } as unknown as HarnessReviewFeedbackService,
    );
  });

  it('counts an approval toward the streak of each gated agent post in one transaction', async () => {
    posts = [post('post-1'), post('post-2')];

    await service.recordDecision(baseInput);

    expect(streakDecisions).toEqual([
      {
        input: expect.objectContaining({
          decision: ReviewDecision.APPROVED,
          generatedCaption: 'Caption post-1',
          hasRewriteHistory: false,
          organizationId: 'org-1',
          postId: 'post-1',
          userId: 'user-1',
          versionPinId: 'workflow_review_gate:exec-1:gate-1',
        }),
        transaction: 1,
      },
      {
        input: expect.objectContaining({ postId: 'post-2' }),
        transaction: 1,
      },
    ]);
    expect(harnessDecisions).toEqual([]);
  });

  it('records a rejection in the streak and once per brand in the harness', async () => {
    posts = [
      post('post-1'),
      post('post-2'),
      post('post-3', { brandId: 'brand-2' }),
    ];

    await service.recordDecision({
      ...baseInput,
      isApproved: false,
      rejectionReason: 'Too salesy',
    });

    expect(streakDecisions.map(({ input }) => input.decision)).toEqual([
      ReviewDecision.REJECTED,
      ReviewDecision.REJECTED,
      ReviewDecision.REJECTED,
    ]);
    expect(harnessDecisions).toEqual([
      {
        brandId: 'brand-1',
        content: 'Caption post-1\n\nCaption post-2',
        decision: ReviewDecision.REJECTED,
        organizationId: 'org-1',
        reason: 'Too salesy',
        sourceId: 'exec-1:gate-1',
        sourceType: 'workflow_review_gate',
      },
      expect.objectContaining({
        brandId: 'brand-2',
        content: 'Caption post-3',
      }),
    ]);
  });

  it.each([
    ['another organization', { organizationId: 'org-2' }],
    ['another execution', { workflowExecutionId: 'exec-2' }],
    ['no agent strategy', { agentStrategyId: null }],
    ['no platform', { platform: null }],
    ['a deleted post', { isDeleted: true }],
  ])(
    'leaves the streak unchanged for a post from %s',
    async (_label, overrides) => {
      posts = [post('post-1', overrides as Partial<PostRow>)];

      await service.recordDecision({ ...baseInput, isApproved: false });

      expect(transactions).toBe(0);
      expect(streakDecisions).toEqual([]);
      expect(harnessDecisions).toEqual([]);
    },
  );

  it('never fails the resolved gate when feedback recording fails', async () => {
    isStreakStoreDown = true;

    await expect(service.recordDecision(baseInput)).resolves.toBeUndefined();
    expect(errors).toEqual([
      'WorkflowReviewGateFeedbackService failed to record review-gate feedback',
    ]);
  });
});
