import { AgentGenerationDecisionService } from '@api/services/agent-orchestrator/agent-generation-decision.service';
import type { ThreadUiActionExecutionParams } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import type { AgentUiAction } from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentGenerationDecisionService', () => {
  const params: ThreadUiActionExecutionParams = {
    context: { organizationId: 'org', userId: 'user' },
    threadId: 'thread',
    model: 'chat',
    payload: { sourceActionId: 'action', generationType: 'image' },
  };
  const card: AgentUiAction = {
    id: 'action',
    type: 'generation_action_card',
    title: 'Generate',
    generationType: 'image',
    data: { brandId: 'brand', scopeVersion: 3, preserved: true },
  };
  let stored: {
    id: string;
    metadata: { other: string; uiActions: AgentUiAction[] };
  }[];
  const findFirst = vi.fn();
  const queryRaw = vi.fn();
  let service: AgentGenerationDecisionService;
  beforeEach(() => {
    stored = ['one', 'two'].map((id) => ({
      id,
      metadata: { other: 'keep', uiActions: [structuredClone(card)] },
    }));
    findFirst.mockResolvedValue({
      id: 'thread',
      brandId: 'brand',
      contextVersion: 3,
    });
    queryRaw.mockReset();
    let queue = Promise.resolve();
    const transaction = {
      $queryRaw: queryRaw,
      agentThread: { findFirst },
      agentMessage: {
        findMany: vi.fn(async () => structuredClone(stored)),
        update: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: { metadata: (typeof stored)[number]['metadata'] };
          }) => {
            const target = stored.find((message) => message.id === where.id);
            if (target) target.metadata = data.metadata;
          },
        ),
      },
    };
    service = new AgentGenerationDecisionService({
      $transaction: (run: (tx: typeof transaction) => Promise<unknown>) => {
        const result = queue.then(async () => {
          const previous = structuredClone(stored);
          try {
            return await run(transaction);
          } catch (error) {
            stored = previous;
            throw error;
          }
        });
        queue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    } as never);
  });
  it('persists all copies, retains unrelated metadata and replays decline', async () => {
    await service.transition(params, 'declined');
    await service.transition(params, 'declined');
    for (const message of stored)
      expect(message.metadata).toEqual({
        other: 'keep',
        uiActions: [
          expect.objectContaining({
            data: {
              ...card.data,
              decision: 'declined',
              sourceActionId: 'action',
            },
          }),
        ],
      });
    await expect(service.transition(params, 'approved')).rejects.toThrow(
      'different decision',
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'thread',
        organizationId: 'org',
        userId: 'user',
        isDeleted: false,
        status: 'active',
      },
    });
  });
  it('arbitrates competing decisions and never permits decline after approval', async () => {
    const results = await Promise.allSettled([
      service.transition(params, 'approved'),
      service.transition(params, 'declined'),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'rejected',
    ]);
    await expect(service.transition(params, 'approved')).resolves.toMatchObject(
      { data: { decision: 'approved' } },
    );
  });
  it('uses the same thread lock for distinct cards sharing message metadata', async () => {
    stored[0].metadata.uiActions.push({ ...card, id: 'other' });
    await Promise.all([
      service.transition(params, 'approved'),
      service.transition(
        { ...params, payload: { sourceActionId: 'other' } },
        'declined',
      ),
    ]);
    expect(
      stored[0].metadata.uiActions.map((action) => action.data?.decision),
    ).toEqual(['approved', 'declined']);
    expect(queryRaw.mock.calls[0][1]).toEqual(queryRaw.mock.calls[1][1]);
  });
  it('rejects missing or inaccessible active thread before message writes', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.transition(params, 'approved')).rejects.toThrow(
      'active generation thread',
    );
    expect(stored[0].metadata.uiActions[0].data?.decision).toBeUndefined();
  });
  it.each([
    { sourceActionId: 'forged' },
    { sourceActionId: 'action', generationType: 'video' },
    { sourceActionId: 'action', prompt: 'forged' },
  ])('rejects forged decline payload %j', async (payload) => {
    await expect(
      service.transition({ ...params, payload }, 'declined'),
    ).rejects.toThrow();
  });
  it('rejects stale recorded scope and rolls back every copy', async () => {
    stored[1].metadata.uiActions[0].data = { scopeVersion: 2 };
    await expect(service.transition(params, 'approved')).rejects.toThrow(
      'earlier thread scope',
    );
    expect(stored[0].metadata.uiActions[0].data?.decision).toBeUndefined();
  });
});
