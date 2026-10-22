import { WinnerPromotionWorkflowService } from '@api/collections/content-performance/services/winner-promotion-workflow.service';
import type { ExecutionContext } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

describe('WinnerPromotionWorkflowService atomic actions', () => {
  it('discovers brand winners and promotes one item through separate actions', async () => {
    const candidate = { content: 'Winning post', item: { postId: 'post-1' } };
    const harness = {
      discoverTopPerformers: vi.fn().mockResolvedValue({
        contextBaseId: 'context-1',
        items: [candidate],
        skipped: 0,
      }),
      promoteTopPerformer: vi
        .fn()
        .mockResolvedValue({ promoted: 1, skipped: 0 }),
    };
    const service = new WinnerPromotionWorkflowService(
      {} as never,
      {} as never,
      harness as never,
    );

    const discovery = await service.prepareBrandWinners('org-1', {
      item: 'brand-1',
    });
    expect(discovery.items).toEqual([candidate]);

    const context = {
      organizationId: 'org-1',
      userId: 'server-owner',
      executionId: 'persisted-execution',
      workflowId: 'pinned-workflow',
      workflowVersionId: 'pinned-version',
    } as unknown as ExecutionContext;
    await service.promoteWinnerItem(
      'org-1',
      {
        contextBaseId: 'context-1',
        item: candidate,
      },
      context,
      'execute',
      'harness.winners.promote-item',
    );
    expect(harness.promoteTopPerformer).toHaveBeenCalledWith(
      'org-1',
      'context-1',
      candidate,
      {
        origin: 'CODE_OWNED_WORKFLOW',
        provenance: {
          organizationId: 'org-1',
          userId: 'server-owner',
          executionId: 'persisted-execution',
          workflowId: 'pinned-workflow',
          workflowVersionId: 'pinned-version',
          nodeId: 'execute',
          actionId: 'harness.winners.promote-item',
        },
      },
    );
  });
});
