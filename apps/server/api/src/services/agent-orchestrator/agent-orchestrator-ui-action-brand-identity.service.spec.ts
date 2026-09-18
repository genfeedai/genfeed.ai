import { AgentGenerationDecisionService } from '@api/services/agent-orchestrator/agent-generation-decision.service';
import type { ThreadUiActionExecutionParams } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentOrchestratorUiActionBrandIdentityService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-brand-identity.service';
import type { AgentChatResult } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ValidatedAgentScope } from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';

const sourceActionId = 'brand-identity-12345678-1234-4234-8234-123456789abc';

function fixture(operation: 'create' | 'rename' = 'rename') {
  const thread = {
    id: 'thread',
    organizationId: 'org',
    userId: 'user',
    isDeleted: false,
    status: 'active',
    brandId: operation === 'create' ? null : 'brand',
    contextVersion: 2,
  };
  const scope: ValidatedAgentScope = {
    brandId: thread.brandId ?? undefined,
    contextVersion: 2,
    isLegacyFallback: false,
    isVersionExplicit: true,
    source: 'explicit',
    organizationId: 'org',
    userId: 'user',
    threadId: 'thread',
  };
  const card = {
    id: sourceActionId,
    type: 'brand_identity_confirmation_card',
    data: {
      operation,
      sourceActionId,
      proposalScope: { brandId: scope.brandId, contextVersion: 2 },
    },
    ctas: [
      {
        action:
          operation === 'create'
            ? 'confirm_create_brand'
            : 'confirm_rename_brand',
        payload: { sourceActionId },
      },
    ],
  };
  const generation = {
    id: 'generation',
    type: 'generation_action_card',
    title: 'Image',
    generationType: 'image',
    data: {
      sourceActionId: 'generation',
      brandId: scope.brandId,
      scopeVersion: 2,
      decision: 'pending',
    },
  };
  const row = {
    id: 'message',
    threadId: 'thread',
    organizationId: 'org',
    isDeleted: false,
    role: 'assistant',
    metadata: {
      agentScope: { brandId: scope.brandId, contextVersion: 2 },
      uiActions: [card, generation],
      note: 'original',
      consumedBrandIdentityActions: {
        earlier: {
          consumedAt: '2026-09-01',
          operation: 'rename',
          contextVersion: 1,
        },
      },
    } as Record<string, unknown>,
  };
  const original = structuredClone(row);
  let inTransaction = false;
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    agentThread: {
      findFirst: vi.fn(async ({ where }) =>
        Object.entries(where).every(
          ([key, value]) => Reflect.get(thread, key) === value,
        )
          ? structuredClone(thread)
          : null,
      ),
    },
    agentMessage: {
      findFirst: vi.fn(async ({ where }) =>
        Object.entries(where).every(
          ([key, value]) => Reflect.get(row, key) === value,
        )
          ? structuredClone(row)
          : null,
      ),
      findMany: vi.fn(async () => [structuredClone(row)]),
      update: vi.fn(async ({ data }) => {
        row.metadata = data.metadata;
        return structuredClone(row);
      }),
      updateMany: vi.fn(async ({ data }) => {
        row.metadata = data.metadata;
        return { count: 1 };
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback) => {
      expect(inTransaction).toBe(false);
      inTransaction = true;
      try {
        return await callback(transaction);
      } finally {
        inTransaction = false;
      }
    }),
  };
  const response: AgentChatResult = {
    threadId: 'thread',
    creditsUsed: 0,
    creditsRemaining: 100,
    toolCalls: [],
    message: { role: 'assistant', content: 'Brand confirmed', metadata: {} },
  };
  const executor = {
    executeTool: vi.fn(async () => {
      expect(inTransaction).toBe(false);
      return {
        success: true,
        creditsUsed: 0,
        data: { brandId: 'created-brand', label: 'Brand' },
      };
    }),
  };
  const scopes = {
    mutateBrandScope: vi.fn(async () => {
      expect(inTransaction).toBe(false);
      thread.brandId = 'created-brand';
      thread.contextVersion = 3;
      return structuredClone(thread);
    }),
    prepareForTurn: vi.fn(async () => {
      expect(inTransaction).toBe(false);
      return {
        existingScope: {
          ...scope,
          brandId: thread.brandId ?? undefined,
          contextVersion: thread.contextVersion,
        },
      };
    }),
  };
  const finalizer = {
    finalizeStructuredAssistantTurn: vi.fn(async () => {
      expect(inTransaction).toBe(false);
      return response;
    }),
  };
  const cache = new Map<string, unknown>();
  const service = new AgentOrchestratorUiActionBrandIdentityService(
    { getMessagesByRoom: vi.fn().mockResolvedValue([original]) } as never,
    {} as never,
    executor as never,
    { recordToolStarted: vi.fn(), recordToolCompleted: vi.fn() } as never,
    scopes as never,
    {
      acquireLock: vi.fn().mockResolvedValue(true),
      releaseLock: vi.fn(),
      get: vi.fn(async (key: string) => cache.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        cache.set(key, value);
      }),
    } as never,
    finalizer as never,
    prisma as never,
  );
  const params: ThreadUiActionExecutionParams = {
    context: { organizationId: 'org', userId: 'user', scope },
    threadId: 'thread',
    model: 'chat',
    payload: { sourceActionId, label: 'Brand' },
  };
  return {
    service,
    params,
    row,
    thread,
    transaction,
    prisma,
    executor,
    scopes,
    finalizer,
    response,
    inTransaction: () => inTransaction,
  };
}

describe('brand identity proposal consumption durability', () => {
  it.each(['rename', 'create'] as const)(
    'preserves a concurrent generation decision during %s consumption',
    async (operation) => {
      const f = fixture(operation);
      const decisions = new AgentGenerationDecisionService(f.prisma as never);
      f.executor.executeTool.mockImplementationOnce(async () => {
        expect(f.inTransaction()).toBe(false);
        await decisions.transition(
          { ...f.params, payload: { sourceActionId: 'generation' } },
          'declined',
        );
        f.row.metadata = {
          ...f.row.metadata,
          note: 'fresh',
          unrelated: { retained: true },
        };
        return {
          success: true,
          creditsUsed: 0,
          data: { brandId: 'created-brand', label: 'Brand' },
        };
      });
      const result = await f.service.execute(operation, f.params);
      expect(f.row.metadata).toMatchObject({
        note: 'fresh',
        unrelated: { retained: true },
        uiActions: [
          expect.objectContaining({ id: sourceActionId }),
          expect.objectContaining({
            id: 'generation',
            data: expect.objectContaining({ decision: 'declined' }),
          }),
        ],
        consumedBrandIdentityActions: {
          earlier: {
            consumedAt: '2026-09-01',
            operation: 'rename',
            contextVersion: 1,
          },
          [sourceActionId]: {
            operation,
            contextVersion: operation === 'create' ? 3 : 2,
            consumedAt: expect.any(String),
          },
        },
      });
      expect(result.scope.contextVersion).toBe(operation === 'create' ? 3 : 2);
      expect(f.scopes.mutateBrandScope).toHaveBeenCalledTimes(
        operation === 'create' ? 1 : 0,
      );
      expect(f.transaction.$queryRaw.mock.calls.map((call) => call[1])).toEqual(
        [
          JSON.stringify([
            'agent-generation-decision',
            'org',
            'user',
            'thread',
          ]),
          JSON.stringify([
            'agent-generation-decision',
            'org',
            'user',
            'thread',
          ]),
        ],
      );
      const lock = f.transaction.$queryRaw.mock.invocationCallOrder[1];
      const threadRead =
        f.transaction.agentThread.findFirst.mock.invocationCallOrder[1];
      const messageRead =
        f.transaction.agentMessage.findFirst.mock.invocationCallOrder[0];
      expect(lock).toBeLessThan(threadRead);
      expect(threadRead).toBeLessThan(messageRead);
      expect(messageRead).toBeLessThan(
        f.transaction.agentMessage.updateMany.mock.invocationCallOrder[0],
      );
      expect(f.transaction.agentThread.findFirst).toHaveBeenLastCalledWith({
        where: {
          id: 'thread',
          organizationId: 'org',
          userId: 'user',
          isDeleted: false,
          status: 'active',
        },
      });
      expect(f.transaction.agentMessage.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'message',
          organizationId: 'org',
          threadId: 'thread',
          isDeleted: false,
          role: 'assistant',
        },
        select: { id: true, metadata: true },
      });
    },
  );

  it('keeps an existing consumption marker instead of overwriting it on a concurrent retry', async () => {
    const f = fixture();
    const marker = {
      consumedAt: '2026-09-10T12:00:00Z',
      contextVersion: 2,
      operation: 'rename',
    };
    f.finalizer.finalizeStructuredAssistantTurn.mockImplementationOnce(
      async () => {
        f.row.metadata = {
          ...f.row.metadata,
          note: 'newer',
          consumedBrandIdentityActions: {
            [sourceActionId]: marker,
            other: { preserved: true },
          },
        };
        return f.response;
      },
    );
    await f.service.execute('rename', f.params);
    expect(f.row.metadata).toMatchObject({
      note: 'newer',
      consumedBrandIdentityActions: {
        [sourceActionId]: marker,
        other: { preserved: true },
      },
    });
    expect(f.transaction.agentMessage.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { userId: 'foreign' },
    { organizationId: 'foreign' },
    { isDeleted: true },
    { status: 'archived' },
    { contextVersion: 3 },
    { brandId: 'other' },
  ])('rejects a changed or unavailable owned thread %j', async (change) => {
    const f = fixture();
    f.finalizer.finalizeStructuredAssistantTurn.mockImplementationOnce(
      async () => {
        Object.assign(f.thread, change);
        return f.response;
      },
    );
    await expect(f.service.execute('rename', f.params)).rejects.toThrow(
      'confirmed scope is unavailable',
    );
    expect(f.transaction.agentMessage.findFirst).not.toHaveBeenCalled();
    expect(f.transaction.agentMessage.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { id: 'other' },
    { organizationId: 'foreign' },
    { threadId: 'other' },
    { isDeleted: true },
    { role: 'user' },
  ])(
    'rejects a missing or inaccessible original message %j',
    async (change) => {
      const f = fixture();
      f.finalizer.finalizeStructuredAssistantTurn.mockImplementationOnce(
        async () => {
          Object.assign(f.row, change);
          return f.response;
        },
      );
      await expect(f.service.execute('rename', f.params)).rejects.toThrow(
        'proposal is unavailable',
      );
      expect(f.transaction.agentMessage.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    { id: 'other' },
    { type: 'generation_action_card' },
    { data: { operation: 'create', sourceActionId } },
    { data: { operation: 'rename', sourceActionId: 'other' } },
  ])(
    'rejects a fresh target that no longer matches the original action %j',
    async (change) => {
      const f = fixture();
      f.finalizer.finalizeStructuredAssistantTurn.mockImplementationOnce(
        async () => {
          const actions = f.row.metadata.uiActions as Record<string, unknown>[];
          f.row.metadata = {
            ...f.row.metadata,
            uiActions: [{ ...actions[0], ...change }, actions[1]],
          };
          return f.response;
        },
      );
      await expect(f.service.execute('rename', f.params)).rejects.toThrow(
        'does not match',
      );
      expect(f.transaction.agentMessage.updateMany).not.toHaveBeenCalled();
    },
  );

  it('fails closed if the source disappears before the scoped write', async () => {
    const f = fixture();
    f.transaction.agentMessage.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(f.service.execute('rename', f.params)).rejects.toThrow(
      'Unable to consume',
    );
  });
});
