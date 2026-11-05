import { createAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadMode, AgentThreadStatus } from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncAgentThreadFromTurn } from './sync-agent-thread-from-turn';

const NOW = '2026-03-21T09:30:00.000Z';

/** The turn runs against a real chat store, as the stream entry wires it. */
function syncInto(
  store: ReturnType<typeof createAgentChatStore>,
  turn: Omit<
    Parameters<typeof syncAgentThreadFromTurn>[0],
    'activeThreadId' | 'setActiveThread' | 'upsertThread'
  >,
): void {
  const { activeThreadId, setActiveThread, upsertThread } = store.getState();
  syncAgentThreadFromTurn({
    ...turn,
    activeThreadId,
    setActiveThread,
    upsertThread,
  });
}

describe('syncAgentThreadFromTurn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists a new thread with the turn title and opens it', () => {
    const store = createAgentChatStore({ ephemeral: true });

    syncInto(store, {
      brandId: 'brand-1',
      contextVersion: 2,
      createdAt: '2026-03-20T10:00:00.000Z',
      mode: AgentThreadMode.PLAN,
      threadId: 'thread-new',
      title: 'Design a launch campaign',
    });

    expect(store.getState().activeThreadId).toBe('thread-new');
    expect(store.getState().threads).toEqual([
      {
        brandId: 'brand-1',
        contextVersion: 2,
        createdAt: '2026-03-20T10:00:00.000Z',
        id: 'thread-new',
        mode: AgentThreadMode.PLAN,
        status: AgentThreadStatus.ACTIVE,
        title: 'Design a launch campaign',
        updatedAt: NOW,
      },
    ]);
  });

  it('retitles the open thread in place and keeps it open', () => {
    const store = createAgentChatStore({ ephemeral: true });
    syncInto(store, { threadId: 'thread-1', title: 'First draft' });

    syncInto(store, { threadId: 'thread-1', title: 'Same thread' });

    expect(store.getState().activeThreadId).toBe('thread-1');
    expect(store.getState().threads).toEqual([
      {
        brandId: undefined,
        contextVersion: 1,
        createdAt: NOW,
        id: 'thread-1',
        mode: undefined,
        status: AgentThreadStatus.ACTIVE,
        title: 'Same thread',
        updatedAt: NOW,
      },
    ]);
  });

  it('switches to the turn thread when another one is open', () => {
    const store = createAgentChatStore({ ephemeral: true });
    syncInto(store, { threadId: 'thread-1', title: 'Older work' });

    syncInto(store, { threadId: 'thread-2', title: 'Newer work' });

    expect(store.getState().activeThreadId).toBe('thread-2');
    expect(store.getState().threads.map((thread) => thread.title)).toEqual(
      expect.arrayContaining(['Older work', 'Newer work']),
    );
  });
});
