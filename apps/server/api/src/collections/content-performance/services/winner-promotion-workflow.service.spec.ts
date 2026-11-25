import { WinnerPromotionWorkflowService } from '@api/collections/content-performance/services/winner-promotion-workflow.service';
import { getActionDefinition } from '@genfeedai/actions';
import {
  type ActionContractJsonSchema,
  compileActionContract,
  type ExecutionContext,
} from '@genfeedai/workflows/engine';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const PROVENANCE = {
  nodeId: 'node',
  runId: 'run-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};

function contractFor(actionId: string) {
  const action = getActionDefinition(actionId);
  if (!action) throw new Error(`Unknown action ${actionId}`);
  return compileActionContract(actionId, {
    inputSchema: action.inputSchema as ActionContractJsonSchema,
    outputSchema: action.outputSchema as ActionContractJsonSchema,
  });
}

const CONTEXT = {
  organizationId: 'org-1',
  userId: 'server-owner',
  executionId: 'persisted-execution',
  workflowId: 'pinned-workflow',
  workflowVersionId: 'pinned-version',
} as unknown as ExecutionContext;

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

  describe('a brand promotion that is denied', () => {
    const permitted = { content: 'Permitted post', item: { postId: 'post-1' } };
    const denied = { content: 'Denied post', item: { postId: 'post-2' } };

    function build(promoteTopPerformer: ReturnType<typeof vi.fn>) {
      return new WinnerPromotionWorkflowService(
        {} as never,
        { releaseLock: vi.fn() } as never,
        { promoteTopPerformer } as never,
      );
    }

    it('records a denied result for the item and a promoted result for the permitted one', async () => {
      const service = build(
        vi.fn(async (_org, _base, candidate) => {
          if (candidate === denied)
            throw new ForbiddenException('Brand access denied');
          return { promoted: 1, skipped: 0 };
        }),
      );
      const run = (candidate: typeof permitted) =>
        service.promoteWinnerItem(
          'org-1',
          { contextBaseId: 'context-1', item: candidate },
          CONTEXT,
          'execute',
          'harness.winners.promote-item',
        );

      expect(await run(permitted)).toEqual({ promoted: 1, skipped: 0 });
      expect(await run(denied)).toEqual({ denied: 1, promoted: 0, skipped: 0 });
    });

    it('still fails the item for an error that is not an access decision', async () => {
      const service = build(vi.fn().mockRejectedValue(new Error('db down')));

      await expect(
        service.promoteWinnerItem(
          'org-1',
          { contextBaseId: 'context-1', item: permitted },
          CONTEXT,
          'execute',
          'harness.winners.promote-item',
        ),
      ).rejects.toThrow('db down');
    });

    it('hands contract-valid batches to both finalizers with accurate counts', async () => {
      const service = build(vi.fn());
      const itemResults = [
        { promoted: 1, skipped: 0 },
        { denied: 1, promoted: 0, skipped: 0 },
      ];
      const promoteItem = contractFor('harness.winners.promote-item');
      expect(() =>
        promoteItem.validateOutput(itemResults[0], PROVENANCE),
      ).not.toThrow();
      expect(() =>
        promoteItem.validateOutput(itemResults[1], PROVENANCE),
      ).not.toThrow();

      const brandResult = service.finalizeBrandWinners({
        batch: { results: itemResults.map((result) => ({ result })) },
        state: { brandId: 'brand-1', skipped: 1 },
      });
      expect(brandResult).toEqual({
        brandId: 'brand-1',
        denied: 1,
        promoted: 1,
        skipped: 1,
        status: 'denied',
      });
      expect(() =>
        contractFor('harness.winners.finalize-brand').validateOutput(
          brandResult,
          PROVENANCE,
        ),
      ).not.toThrow();

      const completed = await service.finalizeOrganizationWinnerPromotion(
        'org-1',
        {
          batch: {
            results: [
              { result: brandResult },
              {
                result: service.finalizeBrandWinners({
                  batch: { results: [{ result: itemResults[0] }] },
                  state: { brandId: 'brand-2' },
                }),
              },
            ],
          },
          discovery: {},
          state: { acquired: true },
        },
      );
      expect(completed).toMatchObject({
        brandsDenied: 1,
        brandsEligible: 2,
        brandsPromoted: 1,
        promoted: 2,
        status: 'completed',
      });
      expect(() =>
        contractFor('harness.winners.finalize').validateOutput(
          completed,
          PROVENANCE,
        ),
      ).not.toThrow();
    });
  });
});
