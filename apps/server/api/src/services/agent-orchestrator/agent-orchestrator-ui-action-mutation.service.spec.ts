import type { ThreadUiActionExecutionParams } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentOrchestratorUiActionMutationService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-mutation.service';
import { buildLogicalWriteKey } from '@genfeedai/actions';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('persisted mutation approvals', () => {
  const args = { count: 3, platforms: ['twitter'], topics: ['Launch'] };
  const sourceActionId = 'mutation-approval:apr-1';
  const params = (): ThreadUiActionExecutionParams =>
    ({
      context: {
        organizationId: 'org-1',
        userId: 'user-1',
        scope: { brandId: 'brand-1', contextVersion: 2 },
      },
      threadId: 'thread-1',
      model: 'test',
      payload: { approvalId: 'apr-1', sourceActionId },
    }) as ThreadUiActionExecutionParams;
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
  const messages = { getMessagesByRoom: vi.fn(), patchAll: vi.fn() };
  const executor = { executeTool: vi.fn() };
  const finalizer = {
    finalizeStructuredAssistantTurn: vi.fn(async (value) => value),
  };
  const service = new AgentOrchestratorUiActionMutationService(
    approvals as never,
    messages as never,
    executor as never,
    finalizer as never,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    approvals.findOwned.mockResolvedValue(approval());
    messages.getMessagesByRoom.mockResolvedValue([
      { id: 'message-1', role: 'assistant', metadata: { uiActions: [card()] } },
    ]);
    messages.patchAll.mockResolvedValue({ modifiedCount: 1 });
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
    expect(messages.patchAll).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'message-1',
        organizationId: 'org-1',
        threadId: 'thread-1',
      }),
      expect.objectContaining({
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
    );
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
  it('declines without invoking the tool', async () => {
    await service.execute('decline_mutation', params());
    expect(approvals.resolve).toHaveBeenCalledWith(
      'apr-1',
      'org-1',
      'decline',
      undefined,
      undefined,
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
    expect(messages.patchAll).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
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
    );
  });
});
