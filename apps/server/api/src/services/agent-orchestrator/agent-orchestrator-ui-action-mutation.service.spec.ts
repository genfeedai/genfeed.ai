import { AgentGenerationDecisionService } from '@api/services/agent-orchestrator/agent-generation-decision.service';
import type { ThreadUiActionExecutionParams } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentOrchestratorUiActionMutationService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-mutation.service';
import { buildLogicalWriteKey } from '@genfeedai/actions';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('persisted mutation approvals', () => {
  const args = { count: 3, platforms: ['twitter'], topics: ['Launch'] };
  const sourceActionId = 'mutation-approval:apr-1';
  const params = (): ThreadUiActionExecutionParams => ({
    context: {
      organizationId: 'org-1',
      userId: 'user-1',
      scope: {
        brandId: 'brand-1',
        contextVersion: 2,
        isLegacyFallback: false,
        isVersionExplicit: true,
        organizationId: 'org-1',
        source: 'explicit',
        threadId: 'thread-1',
        userId: 'user-1',
      },
    },
    threadId: 'thread-1',
    model: 'test',
    payload: { approvalId: 'apr-1', sourceActionId },
  });
  const approval = () => ({
    id: 'apr-1',
    organizationId: 'org-1',
    userId: 'user-1',
    arguments: args,
    toolName: 'generate_content_batch',
    status: 'PENDING',
    isDeleted: false,
    idempotencyKey: buildLogicalWriteKey({
      arguments: args,
      organizationId: 'org-1',
      userId: 'user-1',
      threadId: 'thread-1',
      scope: { brandId: 'brand-1', contextVersion: 2 },
      toolName: 'generate_content_batch',
    }),
  });
  const card = () => ({
    id: sourceActionId,
    type: 'mutation_approval_card',
    data: {
      approvalId: 'apr-1',
      sourceActionId,
      brandId: 'brand-1',
      scopeVersion: 2,
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  const approvals = { findOwned: vi.fn(), resolve: vi.fn() };
  const messages = { getMessagesByRoom: vi.fn() };
  const transaction = {
    $queryRaw: vi.fn(),
    agentThread: { findFirst: vi.fn() },
    agentMessage: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  };
  let openTransactions = 0;
  const prisma = {
    $transaction: vi.fn(async (callback) => {
      openTransactions++;
      try {
        return await callback(transaction);
      } finally {
        openTransactions--;
      }
    }),
  };
  const executor = { executeTool: vi.fn() };
  const finalizer = {
    finalizeStructuredAssistantTurn: vi.fn(async (value) => value),
  };
  const service = new AgentOrchestratorUiActionMutationService(
    approvals as never,
    messages as never,
    executor as never,
    finalizer as never,
    prisma as never,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    openTransactions = 0;
    transaction.$queryRaw.mockResolvedValue([]);
    approvals.findOwned.mockResolvedValue(approval());
    messages.getMessagesByRoom.mockResolvedValue([
      { id: 'message-1', role: 'assistant', metadata: { uiActions: [card()] } },
    ]);
    transaction.agentThread.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      contextVersion: 2,
    });
    transaction.agentMessage.findMany.mockImplementation(async () =>
      messages.getMessagesByRoom(),
    );
    transaction.agentMessage.updateMany.mockResolvedValue({ count: 1 });
    executor.executeTool.mockResolvedValue({
      success: true,
      creditsUsed: 4,
      data: { id: 'batch-1' },
    });
  });
  it('executes stored arguments and consumes the original card', async () => {
    await service.execute('confirm_mutation', params());
    expect(executor.executeTool).toHaveBeenCalledWith(
      'generate_content_batch',
      args,
      expect.objectContaining({
        approvedApprovalId: 'apr-1',
        threadId: 'thread-1',
        userId: 'user-1',
      }),
    );
    expect(transaction.agentMessage.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'message-1',
        organizationId: 'org-1',
        threadId: 'thread-1',
      }),
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          uiActions: [
            expect.objectContaining({
              ctas: [],
              requiresConfirmation: false,
              data: expect.objectContaining({ status: 'approved' }),
            }),
          ],
        }),
      }),
    });
  });
  it.each(['organizationId', 'userId'] as const)(
    'rejects a different %s',
    async (field) => {
      approvals.findOwned.mockResolvedValue({
        ...approval(),
        [field]: 'other',
      });
      await expect(
        service.execute('confirm_mutation', params()),
      ).rejects.toThrow('does not belong');
      expect(executor.executeTool).not.toHaveBeenCalled();
    },
  );
  it('rejects a different thread', async () => {
    await expect(
      service.execute('confirm_mutation', { ...params(), threadId: 'other' }),
    ).rejects.toThrow('does not belong');
    expect(executor.executeTool).not.toHaveBeenCalled();
  });
  it('rejects client-supplied replacement arguments', async () => {
    const request = params();
    request.payload = { ...request.payload, count: 100 };
    await expect(service.execute('confirm_mutation', request)).rejects.toThrow(
      'only the original',
    );
    expect(executor.executeTool).not.toHaveBeenCalled();
  });
  it.each([
    { brandId: 'other' },
    { scopeVersion: 3 },
    { scopeVersion: undefined },
  ])('rejects stale scope %j', async (mismatch) => {
    const action = card();
    messages.getMessagesByRoom.mockResolvedValue([
      {
        id: 'message-1',
        role: 'assistant',
        metadata: {
          uiActions: [{ ...action, data: { ...action.data, ...mismatch } }],
        },
      },
    ]);
    await expect(service.execute('confirm_mutation', params())).rejects.toThrow(
      'stale',
    );
    expect(executor.executeTool).not.toHaveBeenCalled();
  });
  it('rejects a mismatched card/approval pair', async () => {
    const action = card();
    action.data.approvalId = 'other';
    messages.getMessagesByRoom.mockResolvedValue([
      { id: 'message-1', role: 'assistant', metadata: { uiActions: [action] } },
    ]);
    await expect(service.execute('confirm_mutation', params())).rejects.toThrow(
      'does not match',
    );
  });
  it('rejects an expired intent', async () => {
    const action = card();
    action.data.expiresAt = new Date(0).toISOString();
    messages.getMessagesByRoom.mockResolvedValue([
      { id: 'message-1', role: 'assistant', metadata: { uiActions: [action] } },
    ]);
    await expect(service.execute('confirm_mutation', params())).rejects.toThrow(
      'expired',
    );
    expect(executor.executeTool).not.toHaveBeenCalled();
  });
  it('accepts a fresh scoped intent after a brand context switch while rejecting the old card', async () => {
    const request = params();
    request.context.scope = {
      ...request.context.scope,
      brandId: 'brand-2',
      contextVersion: 3,
    } as NonNullable<typeof request.context.scope>;
    await expect(service.execute('confirm_mutation', request)).rejects.toThrow(
      'stale',
    );
    const next = card();
    next.id = 'mutation-approval:apr-2';
    next.data = {
      ...next.data,
      approvalId: 'apr-2',
      sourceActionId: next.id,
      brandId: 'brand-2',
      scopeVersion: 3,
    };
    request.payload = { approvalId: 'apr-2', sourceActionId: next.id };
    approvals.findOwned.mockResolvedValue({
      ...approval(),
      id: 'apr-2',
      idempotencyKey: buildLogicalWriteKey({
        arguments: args,
        organizationId: 'org-1',
        userId: 'user-1',
        threadId: 'thread-1',
        scope: { brandId: 'brand-2', contextVersion: 3 },
        toolName: 'generate_content_batch',
      }),
    });
    messages.getMessagesByRoom.mockResolvedValue([
      { id: 'message-2', role: 'assistant', metadata: { uiActions: [next] } },
    ]);
    transaction.agentThread.findFirst.mockResolvedValue({
      brandId: 'brand-2',
      contextVersion: 3,
    });
    await service.execute('confirm_mutation', request);
    expect(executor.executeTool).toHaveBeenCalledTimes(1);
    expect(executor.executeTool).toHaveBeenCalledWith(
      'generate_content_batch',
      args,
      expect.objectContaining({
        brandId: 'brand-2',
        approvedApprovalId: 'apr-2',
      }),
    );
  });

  it('consumes every persisted copy of the same pending card', async () => {
    messages.getMessagesByRoom.mockResolvedValue(
      ['message-1', 'message-2'].map((id) => ({
        id,
        role: 'assistant',
        metadata: { uiActions: [card()] },
      })),
    );
    await service.execute('confirm_mutation', params());
    expect(transaction.agentMessage.updateMany).toHaveBeenCalledTimes(4);
    expect(
      transaction.agentMessage.updateMany.mock.calls.map(
        (call) => call[0].where.id,
      ),
    ).toEqual(['message-1', 'message-2', 'message-1', 'message-2']);
    expect(executor.executeTool).toHaveBeenCalledTimes(1);
  });

  it('uses one stable terminal message identity on approved retries', async () => {
    await service.execute('confirm_mutation', params());
    approvals.findOwned.mockResolvedValue({
      ...approval(),
      status: 'APPROVED',
    });
    await service.execute('confirm_mutation', params());
    const ids = finalizer.finalizeStructuredAssistantTurn.mock.calls.map(
      (call) => call[0].messageId,
    );
    expect(ids[0]).toEqual(expect.any(String));
    expect(ids[1]).toBe(ids[0]);
  });

  it('declines without invoking the tool', async () => {
    await service.execute('decline_mutation', params());
    expect(approvals.resolve).toHaveBeenCalledWith(
      'apr-1',
      'org-1',
      'decline',
      undefined,
      undefined,
      transaction,
    );
    expect(executor.executeTool).not.toHaveBeenCalled();
  });
  it('cannot approve a declined intent', async () => {
    approvals.findOwned.mockResolvedValue({
      ...approval(),
      status: 'DECLINED',
    });
    await expect(service.execute('confirm_mutation', params())).rejects.toThrow(
      'declined',
    );
    expect(executor.executeTool).not.toHaveBeenCalled();
  });
  it('resumes approved retries through the executor replay gate without resolving twice', async () => {
    approvals.findOwned.mockResolvedValue({
      ...approval(),
      status: 'APPROVED',
    });
    await service.execute('confirm_mutation', params());
    expect(approvals.resolve).not.toHaveBeenCalled();
    expect(executor.executeTool).toHaveBeenCalledTimes(1);
  });
  it('does not execute after losing the atomic approval resolution', async () => {
    approvals.resolve.mockRejectedValueOnce(
      new Error('Approval already resolved'),
    );
    await expect(service.execute('confirm_mutation', params())).rejects.toThrow(
      'already resolved',
    );
    expect(executor.executeTool).not.toHaveBeenCalled();
  });
  it('accepts an already-persisted decline without re-resolving or dispatching', async () => {
    approvals.findOwned.mockResolvedValue({
      ...approval(),
      status: 'DECLINED',
    });
    const action = card();
    action.data.status = 'declined';
    messages.getMessagesByRoom.mockResolvedValue([
      { id: 'message-1', role: 'assistant', metadata: { uiActions: [action] } },
    ]);
    await service.execute('decline_mutation', params());
    expect(approvals.resolve).not.toHaveBeenCalled();
    expect(executor.executeTool).not.toHaveBeenCalled();
  });

  it('retries card persistence using the executor replay instead of resolving again', async () => {
    transaction.agentMessage.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.execute('confirm_mutation', params())).rejects.toThrow(
      'Unable to update',
    );
    approvals.findOwned.mockResolvedValue({
      ...approval(),
      status: 'APPROVED',
    });
    executor.executeTool.mockResolvedValue({
      success: true,
      creditsUsed: 0,
      data: { id: 'batch-1' },
    });
    await service.execute('confirm_mutation', params());
    expect(approvals.resolve).toHaveBeenCalledTimes(1);
    expect(finalizer.finalizeStructuredAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          nextActions: [
            expect.objectContaining({
              id: sourceActionId,
              requiresConfirmation: false,
            }),
          ],
        }),
      }),
    );
  });

  it('persists execution failure separately from consent and reports failure', async () => {
    executor.executeTool.mockResolvedValue({
      success: false,
      creditsUsed: 0,
      error: 'Provider unavailable',
    });
    await service.execute('confirm_mutation', params());
    expect(finalizer.finalizeStructuredAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Approved action failed: Provider unavailable',
        result: expect.objectContaining({ success: false }),
      }),
    );
    expect(transaction.agentMessage.updateMany).toHaveBeenCalledWith({
      where: expect.anything(),
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          uiActions: [
            expect.objectContaining({
              data: expect.objectContaining({
                status: 'approved',
                executionStatus: 'failed',
              }),
            }),
          ],
        }),
      }),
    });
  });

  it('preserves a generation decision written after loading the mutation proposal', async () => {
    const generation = {
      id: 'generation-1',
      type: 'generation_action_card',
      title: 'Image',
      generationType: 'image',
      data: {
        sourceActionId: 'generation-1',
        brandId: 'brand-1',
        scopeVersion: 2,
        decision: 'pending',
      },
    };
    const original = {
      id: 'message-1',
      role: 'assistant',
      metadata: { uiActions: [card(), generation], note: 'original' },
    };
    let persisted: Record<string, unknown> = structuredClone(original.metadata);
    messages.getMessagesByRoom.mockResolvedValue([structuredClone(original)]);
    transaction.agentMessage.findMany.mockImplementation(async () => [
      { id: original.id, metadata: structuredClone(persisted) },
    ]);
    transaction.agentMessage.update.mockImplementation(async ({ data }) => {
      persisted = data.metadata;
      return { id: original.id };
    });
    transaction.agentMessage.updateMany.mockImplementation(async ({ data }) => {
      persisted = data.metadata;
      return { count: 1 };
    });
    const decisions = new AgentGenerationDecisionService(prisma as never);
    executor.executeTool.mockImplementationOnce(async () => {
      expect(openTransactions).toBe(0);
      await decisions.transition(
        { ...params(), payload: { sourceActionId: generation.id } },
        'declined',
      );
      persisted = {
        ...persisted,
        note: 'fresh metadata',
        unrelated: { retained: true },
      };
      return { success: true, creditsUsed: 4 };
    });
    await service.execute('confirm_mutation', params());
    expect(persisted).toMatchObject({
      note: 'fresh metadata',
      unrelated: { retained: true },
      uiActions: [
        expect.objectContaining({
          id: sourceActionId,
          data: expect.objectContaining({ status: 'approved' }),
        }),
        expect.objectContaining({
          id: generation.id,
          data: expect.objectContaining({ decision: 'declined' }),
        }),
      ],
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(5);
    expect(
      transaction.$queryRaw.mock.calls
        .filter((call) => String(call[0]).includes('pg_advisory'))
        .map((call) => call[1]),
    ).toEqual(
      Array(3).fill(
        JSON.stringify([
          'agent-generation-decision',
          'org-1',
          'user-1',
          'thread-1',
        ]),
      ),
    );
    const rowLocks = transaction.$queryRaw.mock.calls.filter((call) =>
      String(call[0]).includes('FOR UPDATE'),
    );
    expect(rowLocks).toHaveLength(2);
    for (const lock of rowLocks) {
      expect(String(lock[0])).toContain('"isDeleted" = false');
      expect(lock.slice(1)).toEqual(['thread-1', 'org-1', 'user-1']);
    }
    const locks = transaction.$queryRaw.mock.invocationCallOrder;
    const threadReads =
      transaction.agentThread.findFirst.mock.invocationCallOrder;
    const messageReads =
      transaction.agentMessage.findMany.mock.invocationCallOrder;
    expect(locks[0]).toBeLessThan(locks[1]);
    expect(locks[1]).toBeLessThan(threadReads[0]);
    expect(threadReads[0]).toBeLessThan(messageReads[0]);
    expect(messageReads[0]).toBeLessThan(
      approvals.resolve.mock.invocationCallOrder[0],
    );
    expect(threadReads[1]).toBeLessThan(messageReads[1]);
    expect(messageReads[1]).toBeLessThan(
      transaction.agentMessage.updateMany.mock.invocationCallOrder[1],
    );
    expect(transaction.agentMessage.findMany).toHaveBeenLastCalledWith({
      where: {
        threadId: 'thread-1',
        organizationId: 'org-1',
        isDeleted: false,
        role: 'assistant',
      },
      select: { id: true, metadata: true },
    });
  });

  it('rejects an unavailable owned active thread before reading or patching messages', async () => {
    transaction.agentThread.findFirst.mockResolvedValue(null);
    await expect(service.execute('decline_mutation', params())).rejects.toThrow(
      'active approval thread',
    );
    expect(transaction.agentThread.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'thread-1',
        organizationId: 'org-1',
        userId: 'user-1',
        isDeleted: false,
        status: 'active',
      },
    });
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.agentThread.findFirst.mock.invocationCallOrder[0],
    );
    expect(approvals.resolve).not.toHaveBeenCalled();
    expect(executor.executeTool).not.toHaveBeenCalled();
    expect(transaction.agentMessage.findMany).not.toHaveBeenCalled();
    expect(transaction.agentMessage.updateMany).not.toHaveBeenCalled();
    expect(finalizer.finalizeStructuredAssistantTurn).not.toHaveBeenCalled();
  });

  it.each([
    { approvalId: 'other' },
    { sourceActionId: 'other' },
    { scopeVersion: 3 },
    { brandId: 'other' },
  ])('revalidates fresh card identity and scope %j', async (change) => {
    const fresh = card();
    fresh.data = { ...fresh.data, ...change };
    transaction.agentMessage.findMany.mockResolvedValue([
      { id: 'message-1', metadata: { uiActions: [fresh] } },
    ]);
    await expect(
      service.execute('decline_mutation', params()),
    ).rejects.toThrow();
    expect(approvals.resolve).not.toHaveBeenCalled();
    expect(executor.executeTool).not.toHaveBeenCalled();
    expect(transaction.agentMessage.updateMany).not.toHaveBeenCalled();
    expect(finalizer.finalizeStructuredAssistantTurn).not.toHaveBeenCalled();
  });

  it('rejects a thread scope changed since initial proposal validation', async () => {
    transaction.agentThread.findFirst.mockResolvedValue({
      brandId: 'brand-2',
      contextVersion: 3,
    });
    await expect(service.execute('decline_mutation', params())).rejects.toThrow(
      'scope is unavailable',
    );
    expect(approvals.resolve).not.toHaveBeenCalled();
    expect(executor.executeTool).not.toHaveBeenCalled();
    expect(transaction.agentMessage.findMany).not.toHaveBeenCalled();
    expect(transaction.agentMessage.updateMany).not.toHaveBeenCalled();
  });
  it('persists approved consent before dispatch outside transactions', async () => {
    executor.executeTool.mockImplementationOnce(async () => {
      expect(openTransactions).toBe(0);
      expect(transaction.agentMessage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            metadata: expect.objectContaining({
              uiActions: [
                expect.objectContaining({
                  data: expect.objectContaining({
                    status: 'approved',
                    executionStatus: 'running',
                  }),
                }),
              ],
            }),
          },
        }),
      );
      return { success: true, creditsUsed: 4 };
    });
    await service.execute('confirm_mutation', params());
    expect(approvals.resolve).toHaveBeenCalledWith(
      'apr-1',
      'org-1',
      'approve',
      undefined,
      undefined,
      transaction,
    );
  });
  it.each(['missing', 'expired', 'replaced'])(
    'rejects a fresh %s card before consent or dispatch',
    async (kind) => {
      const fresh = card();
      if (kind === 'expired') fresh.data.expiresAt = new Date(0).toISOString();
      if (kind === 'replaced') fresh.type = 'other';
      transaction.agentMessage.findMany.mockResolvedValue(
        kind === 'missing'
          ? []
          : [{ id: 'message-1', metadata: { uiActions: [fresh] } }],
      );
      await expect(
        service.execute('confirm_mutation', params()),
      ).rejects.toThrow();
      expect(approvals.resolve).not.toHaveBeenCalled();
      expect(executor.executeTool).not.toHaveBeenCalled();
    },
  );
  it('never dispatches when admission persistence fails', async () => {
    transaction.agentMessage.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.execute('confirm_mutation', params()),
    ).rejects.toThrow();
    expect(executor.executeTool).not.toHaveBeenCalled();
  });
  it('never dispatches when admission commit fails', async () => {
    prisma.$transaction.mockImplementationOnce(async (callback) => {
      await callback(transaction);
      throw new Error('commit failed');
    });
    await expect(service.execute('confirm_mutation', params())).rejects.toThrow(
      'commit failed',
    );
    expect(executor.executeTool).not.toHaveBeenCalled();
  });
  it('completes in the original card scope after archive and a scope switch', async () => {
    executor.executeTool.mockImplementationOnce(async () => {
      transaction.agentThread.findFirst.mockResolvedValue({
        brandId: 'brand-2',
        contextVersion: 3,
        status: 'archived',
      });
      return { success: true, creditsUsed: 4 };
    });
    await service.execute('confirm_mutation', params());
    expect(finalizer.finalizeStructuredAssistantTurn).toHaveBeenCalled();
    expect(transaction.agentMessage.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          metadata: expect.objectContaining({
            uiActions: [
              expect.objectContaining({
                data: expect.objectContaining({
                  brandId: 'brand-1',
                  scopeVersion: 2,
                  executionStatus: 'completed',
                }),
              }),
            ],
          }),
        },
      }),
    );
    expect(transaction.agentThread.findFirst).toHaveBeenLastCalledWith({
      where: {
        id: 'thread-1',
        organizationId: 'org-1',
        userId: 'user-1',
        isDeleted: false,
      },
    });
  });
  it('does not regress a completed card during approved replay', async () => {
    approvals.findOwned.mockResolvedValue({
      ...approval(),
      status: 'APPROVED',
    });
    const fresh = {
      ...card(),
      data: {
        ...card().data,
        status: 'approved',
        executionStatus: 'completed',
      },
    };
    transaction.agentMessage.findMany.mockResolvedValue([
      { id: 'message-1', metadata: { uiActions: [fresh] } },
    ]);
    executor.executeTool.mockImplementationOnce(async () => {
      expect(
        JSON.stringify(transaction.agentMessage.updateMany.mock.calls),
      ).not.toContain('running');
      return { success: true, creditsUsed: 0 };
    });
    await service.execute('confirm_mutation', params());
    expect(approvals.resolve).not.toHaveBeenCalled();
  });
  it.each([
    ['confirm_mutation', 'declined'],
    ['decline_mutation', 'approved'],
  ] as const)(
    'rejects fresh opposite consent for %s',
    async (action, status) => {
      const fresh = card();
      fresh.data.status = status;
      transaction.agentMessage.findMany.mockResolvedValue([
        { id: 'message-1', metadata: { uiActions: [fresh] } },
      ]);
      await expect(service.execute(action, params())).rejects.toThrow(
        'opposite consent',
      );
      expect(approvals.resolve).not.toHaveBeenCalled();
      expect(executor.executeTool).not.toHaveBeenCalled();
    },
  );
});
