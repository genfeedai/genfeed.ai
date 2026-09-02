import { AgentThreadStatus } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';
import { syncAgentThreadFromTurn } from './sync-agent-thread-from-turn';

describe('syncAgentThreadFromTurn', () => {
  it('upserts the thread title and activates a new thread id', () => {
    const setActiveThread = vi.fn();
    const upsertThread = vi.fn();

    syncAgentThreadFromTurn({
      activeThreadId: null,
      brandId: 'brand-1',
      contextVersion: 2,
      createdAt: '2026-03-20T10:00:00.000Z',
      planModeEnabled: true,
      setActiveThread,
      threadId: 'thread-new',
      title: 'Design a launch campaign',
      upsertThread,
    });

    expect(setActiveThread).toHaveBeenCalledWith('thread-new');
    expect(upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        contextVersion: 2,
        createdAt: '2026-03-20T10:00:00.000Z',
        id: 'thread-new',
        planModeEnabled: true,
        status: AgentThreadStatus.ACTIVE,
        title: 'Design a launch campaign',
      }),
    );
    const upserted = upsertThread.mock.calls[0]?.[0];
    expect(upserted?.updatedAt).toEqual(expect.any(String));
  });

  it('does not switch the active thread when the id is unchanged', () => {
    const setActiveThread = vi.fn();
    const upsertThread = vi.fn();

    syncAgentThreadFromTurn({
      activeThreadId: 'thread-1',
      setActiveThread,
      threadId: 'thread-1',
      title: 'Same thread',
      upsertThread,
    });

    expect(setActiveThread).not.toHaveBeenCalled();
    expect(upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'thread-1',
        title: 'Same thread',
      }),
    );
  });
});
