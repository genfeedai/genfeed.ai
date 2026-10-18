import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentReviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-review-tool-handler.service';
import { readReviewQueueSnapshot } from '@api/services/agent-orchestrator/utils/agent-review-queue-context.util';
import { ReviewDecision, TurboRunItemStatus } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { describe, expect, it, vi } from 'vitest';

const turboRunId = testId('reviewturboRun');
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

  it('adds a decidable review gate card for pending workflow gates', async () => {
    const listPendingReviewGatesForMember = vi.fn().mockResolvedValue([
      {
        actionSummary: 'Continue Weekly posts with the output waiting',
        brandLabel: 'Acme',
        id: 'workflow_review_gate:exec-1:gate-1',
        preview: { caption: 'Launch caption', mediaUrl: null },
        sourceLabel: 'Weekly posts',
      },
    ]);
    const handler = new AgentReviewToolHandler(
      {
        getReviewInboxSummary: vi.fn().mockResolvedValue({
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
        }),
      } as never,
      { listPendingReviewGatesForMember } as never,
    );

    const result = await handler.listReviewQueue({}, ctx);

    expect(listPendingReviewGatesForMember).toHaveBeenCalledWith({
      brandId: undefined,
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(result.data).toMatchObject({ reviewGateCount: 1 });
    expect(result.nextActions?.[0]).toMatchObject({
      items: [
        {
          id: 'workflow_review_gate:exec-1:gate-1',
          title: 'Launch caption',
          type: 'Weekly posts · Acme',
        },
      ],
      type: 'review_gate_card',
    });
    expect(result.nextActions?.[1]?.summaryText).toContain(
      '1 workflow review gate is waiting for a decision.',
    );
  });

  it('still lists the inbox when review gates cannot be loaded', async () => {
    const handler = new AgentReviewToolHandler(
      {
        getReviewInboxSummary: vi.fn().mockResolvedValue({
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
        }),
      } as never,
      {
        listPendingReviewGatesForMember: vi
          .fn()
          .mockRejectedValue(new Error('Brand access denied')),
      } as never,
    );

    const result = await handler.listReviewQueue({}, ctx);

    expect(result.success).toBe(true);
    expect(result.nextActions).toHaveLength(1);
    expect(result.nextActions?.[0]?.type).toBe('completion_summary_card');
  });

  it('counts the entire filtered batch before pagination and excludes unfinished and failed items from ready', async () => {
    const handler = new AgentReviewToolHandler({
      getTurboRun: vi.fn().mockResolvedValue({
        id: turboRunId,
        totalCount: 6,
        items: [
          { id: 'pending', status: TurboRunItemStatus.PENDING },
          { id: 'processing', status: TurboRunItemStatus.PROCESSING },
          { id: 'failed', status: TurboRunItemStatus.FAILED },
          { id: 'ready', status: TurboRunItemStatus.COMPLETED },
          {
            id: 'approved',
            status: TurboRunItemStatus.COMPLETED,
            reviewDecision: ReviewDecision.APPROVED,
          },
          {
            id: 'changes',
            status: TurboRunItemStatus.COMPLETED,
            reviewDecision: ReviewDecision.REQUEST_CHANGES,
          },
        ],
      }),
    } as never);
    const result = await handler.listReviewQueue({ turboRunId, limit: 1 }, ctx);
    expect(result.data).toMatchObject({
      approvedCount: 1,
      changesRequestedCount: 1,
      pendingCount: 2,
      readyCount: 1,
    });
    expect(result.data?.items).toHaveLength(1);
    const filtered = await handler.listReviewQueue(
      { turboRunId, status: TurboRunItemStatus.PROCESSING },
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
    TurboRunItemStatus.FAILED,
    TurboRunItemStatus.SKIPPED,
  ])(
    'does not infer an empty inbox from a zero-match batch filter: %s',
    async (status) => {
      const handler = new AgentReviewToolHandler({
        getTurboRun: vi.fn().mockResolvedValue({
          id: turboRunId,
          totalCount: 1,
          items: [{ id: 'ready', status: TurboRunItemStatus.COMPLETED }],
        }),
      } as never);
      const result = await handler.listReviewQueue({ turboRunId, status }, ctx);
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
