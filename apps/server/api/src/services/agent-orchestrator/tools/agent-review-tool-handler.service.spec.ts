import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentReviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-review-tool-handler.service';
import { readReviewQueueSnapshot } from '@api/services/agent-orchestrator/utils/agent-review-queue-context.util';
import { BatchItemStatus, ReviewDecision } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { describe, expect, it, vi } from 'vitest';

const batchId = testId('reviewbatch');
const ctx = { organizationId: 'org-1', userId: 'user-1' };
const builder = new AgentCompletionCardBuilderService();

describe('review result follow-ups', () => {
  it('offers creation instead of approval for an empty inbox', async () => {
    const handler = new AgentReviewToolHandler({
      getReviewInboxSummary: vi.fn().mockResolvedValue({
        approvedCount: 0,
        changesRequestedCount: 0,
        pendingCount: 0,
        readyCount: 0,
        recentItems: [],
        rejectedCount: 0,
      }),
    } as never);
    const result = await handler.listReviewQueue({}, ctx);
    const ui = builder.buildAssistantUiActions({
      reviewRequired: false,
      toolCalls: [
        {
          status: 'completed',
          toolName: 'list_review_queue',
          reviewQueue: readReviewQueueSnapshot('list_review_queue', result),
        },
      ],
      uiActions: result.nextActions ?? [],
    });
    expect(ui.suggestedActions.map((action) => action.id)).toEqual([
      'review-create',
      'review-ideas',
    ]);
    expect(ui.uiActions[0]?.summaryText).toBe(
      'Nothing is waiting for review right now.',
    );
  });

  it('counts the entire filtered batch before pagination and excludes unfinished and failed items from ready', async () => {
    const handler = new AgentReviewToolHandler({
      getBatch: vi.fn().mockResolvedValue({
        id: batchId,
        totalCount: 6,
        items: [
          { id: 'pending', status: BatchItemStatus.PENDING },
          { id: 'processing', status: BatchItemStatus.PROCESSING },
          { id: 'failed', status: BatchItemStatus.FAILED },
          { id: 'ready', status: BatchItemStatus.COMPLETED },
          {
            id: 'approved',
            status: BatchItemStatus.COMPLETED,
            reviewDecision: ReviewDecision.APPROVED,
          },
          {
            id: 'changes',
            status: BatchItemStatus.COMPLETED,
            reviewDecision: ReviewDecision.REQUEST_CHANGES,
          },
        ],
      }),
    } as never);
    const result = await handler.listReviewQueue({ batchId, limit: 1 }, ctx);
    expect(result.data).toMatchObject({
      approvedCount: 1,
      changesRequestedCount: 1,
      pendingCount: 2,
      readyCount: 1,
    });
    expect(result.data?.items).toHaveLength(1);
    const filtered = await handler.listReviewQueue(
      { batchId, status: BatchItemStatus.PROCESSING },
      ctx,
    );
    const ui = builder.buildAssistantUiActions({
      reviewRequired: false,
      toolCalls: [
        {
          status: 'completed',
          toolName: 'list_review_queue',
          reviewQueue: readReviewQueueSnapshot('list_review_queue', filtered),
        },
      ],
      uiActions: filtered.nextActions ?? [],
    });
    expect(ui.suggestedActions.map((action) => action.id)).toEqual([
      'review-progress',
    ]);
  });
  it.each([
    'completed',
    'ready',
    BatchItemStatus.FAILED,
    BatchItemStatus.SKIPPED,
  ])(
    'does not infer an empty inbox from a zero-match batch filter: %s',
    async (status) => {
      const handler = new AgentReviewToolHandler({
        getBatch: vi.fn().mockResolvedValue({
          id: batchId,
          totalCount: 1,
          items: [{ id: 'ready', status: BatchItemStatus.COMPLETED }],
        }),
      } as never);
      const result = await handler.listReviewQueue({ batchId, status }, ctx);
      const ui = builder.buildAssistantUiActions({
        reviewRequired: false,
        toolCalls: [
          {
            status: 'completed',
            toolName: 'list_review_queue',
            reviewQueue: readReviewQueueSnapshot('list_review_queue', result),
          },
        ],
        uiActions: result.nextActions ?? [],
      });
      expect(ui.suggestedActions.map((action) => action.id)).toEqual([
        'review-open',
      ]);
      expect(result.data?.items).toEqual([]);
    },
  );
});
