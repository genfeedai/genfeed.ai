import { UpdateAgentModeDto } from '@api/collections/agent-threads/dto/update-agent-mode.dto';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { AgentThreadMode } from '@genfeedai/contracts';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const state = { mode: 'manual', savedMode: 'manual' };
  const updateMany = vi.fn(async () => {
    state.mode = 'auto';
    return { count: 1 };
  });
  const upsert = vi.fn(async () => {
    state.savedMode = 'auto';
    return {};
  });
  const tx = { agentThread: { updateMany }, setting: { upsert } };
  const prisma = {
    agentThread: {},
    $transaction: async (run: (transaction: typeof tx) => Promise<unknown>) => {
      const before = { ...state };
      try {
        return await run(tx);
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
  };
  const service = new AgentThreadsService(
    prisma as never,
    {} as never,
    {} as never,
  );
  return { service, state, updateMany, upsert };
}

describe('Agent thread mode command', () => {
  it('updates the owned active thread and nondeleted user setting in one transaction', async () => {
    const { service, state, updateMany, upsert } = fixture();
    expect(
      await service.updateAgentMode(
        'user',
        'org',
        AgentThreadMode.AUTO,
        'thread',
      ),
    ).toEqual({ mode: 'auto', threadId: 'thread' });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'thread',
        organizationId: 'org',
        userId: 'user',
        isDeleted: false,
        status: 'active',
      },
      data: { mode: 'auto' },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { userId: 'user', isDeleted: false },
      create: { userId: 'user', agentMode: 'auto' },
      update: { agentMode: 'auto' },
    });
    expect(state).toEqual({ mode: 'auto', savedMode: 'auto' });
  });
  it('rolls back thread changes if setting persistence fails', async () => {
    const { service, state, upsert } = fixture();
    upsert.mockRejectedValue(new Error('setting unavailable'));
    await expect(
      service.updateAgentMode('user', 'org', AgentThreadMode.AUTO, 'thread'),
    ).rejects.toThrow('setting unavailable');
    expect(state).toEqual({ mode: 'manual', savedMode: 'manual' });
  });
  it('does not touch settings for a missing/foreign/deleted/archived thread', async () => {
    const { service, updateMany, upsert } = fixture();
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateAgentMode('user', 'org', AgentThreadMode.AUTO, 'thread'),
    ).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });
  it('updates only the default when no thread is supplied', async () => {
    const { service, updateMany, upsert } = fixture();
    await service.updateAgentMode('user', 'org', AgentThreadMode.AUTO);
    expect(updateMany).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledOnce();
  });
  it('validates the mode at both boundaries', async () => {
    const { service, updateMany } = fixture();
    await expect(
      service.updateAgentMode('user', 'org', 'broken' as AgentThreadMode),
    ).rejects.toThrow('Invalid agent mode');
    expect(
      (
        await validate(
          Object.assign(new UpdateAgentModeDto(), { mode: 'broken' }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
