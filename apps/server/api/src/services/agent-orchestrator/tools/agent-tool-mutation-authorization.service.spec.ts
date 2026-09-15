import { AgentToolMutationAuthorizationService } from '@api/services/agent-orchestrator/tools/agent-tool-mutation-authorization.service';
import { describe, expect, it, vi } from 'vitest';

describe('AgentToolMutationAuthorizationService trusted mode', () => {
  it('requires a stored pending approval id and returns a zero-credit confirmation card', async () => {
    const createPending = vi
      .fn()
      .mockResolvedValue({ id: 'pending-id', status: 'PENDING' });
    const service = new AgentToolMutationAuthorizationService(
      {} as never,
      {
        createPending,
        findActiveByIdempotencyKey: vi.fn().mockResolvedValue(null),
      } as never,
    );
    const result = await service.authorize(
      'capture_memory',
      { content: 'Remember this' },
      {
        organizationId: 'org',
        userId: 'user',
        threadId: 'thread',
        hostSupportsApproval: true,
      },
      {} as never,
    );
    expect(result).toMatchObject({
      kind: 'return',
      result: {
        approvalId: 'pending-id',
        approvalStatus: 'pending',
        creditsUsed: 0,
        requiresConfirmation: true,
        nextActions: [
          expect.objectContaining({ type: 'mutation_approval_card' }),
        ],
      },
    });
    createPending.mockResolvedValue(undefined);
    await expect(
      service.authorize(
        'capture_memory',
        { content: 'Remember this' },
        {
          organizationId: 'org',
          userId: 'user',
          threadId: 'thread',
          hostSupportsApproval: true,
        },
        {} as never,
      ),
    ).rejects.toThrow('pending approval id');
  });
  const context = {
    organizationId: 'org',
    userId: 'user',
    agentMode: 'auto' as const,
  };
  it('ignores caller mode without a thread', async () => {
    const service = new AgentToolMutationAuthorizationService({} as never);
    expect(await service.resolveAgentModeForContext(context)).toBeUndefined();
    expect(
      await service.resolveAgentModeForContext({
        ...context,
        threadId: 'thread',
      }),
    ).toBe('manual');
  });
  it.each([
    null,
    { mode: 'broken' },
    { mode: 'manual' },
    { mode: 'plan' },
    { mode: 'auto' },
  ])('uses owned persisted mode or fails closed: %j', async (thread) => {
    const findOne = vi.fn().mockResolvedValue(thread);
    const service = new AgentToolMutationAuthorizationService(
      {} as never,
      undefined,
      { findOne } as never,
    );
    expect(
      await service.resolveAgentModeForContext({
        ...context,
        threadId: 'thread',
      }),
    ).toBe(
      thread?.mode === 'plan' || thread?.mode === 'auto'
        ? thread.mode
        : 'manual',
    );
    expect(findOne).toHaveBeenCalledWith({
      id: 'thread',
      organizationId: 'org',
      userId: 'user',
      isDeleted: false,
    });
  });
  it('rejects storage errors without executing', async () => {
    const service = new AgentToolMutationAuthorizationService(
      {} as never,
      undefined,
      { findOne: vi.fn().mockRejectedValue(new Error('offline')) } as never,
    );
    await expect(
      service.resolveAgentModeForContext({ ...context, threadId: 'thread' }),
    ).rejects.toThrow('offline');
  });
});
