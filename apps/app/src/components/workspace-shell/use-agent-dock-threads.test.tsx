import { type AgentThread, useAgentChatStore } from '@genfeedai/agent';
import { AgentThreadKind, AgentThreadStatus } from '@genfeedai/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentDockThreads } from './use-agent-dock-threads';

type StoredMessage = ReturnType<
  typeof useAgentChatStore.getState
>['messages'][number];

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});
function makeThread(id: string, title: string): AgentThread {
  return {
    id,
    title,
    contextVersion: 0,
    status: AgentThreadStatus.ACTIVE,
    createdAt: '2026-10-25T00:00:00Z',
    updatedAt: '2026-10-25T00:00:00Z',
  };
}
const getMessages = vi.fn(async (): Promise<StoredMessage[]> => []);
const getThreads = vi.fn(async (): Promise<AgentThread[]> => []);
const apiService = { getMessages, getThreads } satisfies Parameters<
  typeof useAgentDockThreads
>[0];
describe('useAgentDockThreads history and lifecycle', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    getMessages.mockReset().mockResolvedValue([]);
    getThreads.mockReset().mockResolvedValue([]);
    useAgentChatStore
      .getState()
      .setThreads([
        makeThread('thread-1', 'Spring launch plan'),
        makeThread('thread-2', 'Caption ideas'),
      ]);
  });
  it('offers actual stored conversations without creating a parallel chat-tab model', () => {
    const { result } = renderHook(() => useAgentDockThreads(apiService, false));
    expect(result.current.threads).toEqual([
      { id: 'thread-1', title: 'Spring launch plan' },
      { id: 'thread-2', title: 'Caption ideas' },
    ]);
    expect(getThreads).not.toHaveBeenCalled();
  });
  it('loads real History and publishes its loading state', async () => {
    getThreads.mockResolvedValue([makeThread('loaded', 'Loaded conversation')]);
    const { result } = renderHook(() => useAgentDockThreads(apiService, true));
    await waitFor(() =>
      expect(result.current.threads).toEqual([
        { id: 'loaded', title: 'Loaded conversation' },
      ]),
    );
    expect(result.current.isThreadListLoading).toBe(false);
    expect(getThreads).toHaveBeenCalledWith(
      { limit: 30, status: AgentThreadStatus.ACTIVE },
      expect.any(AbortSignal),
    );
  });
  it('selects the actual thread and restores cached messages when revisiting it', async () => {
    const message: StoredMessage = {
      id: 'message-1',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'Existing draft',
      createdAt: '2026-10-25T00:00:00Z',
    };
    getMessages.mockResolvedValueOnce([message]);
    const { result } = renderHook(() => useAgentDockThreads(apiService, false));
    await act(async () => {
      await result.current.selectThread('thread-1');
    });
    await act(async () => {
      await result.current.selectThread('thread-2');
    });
    await act(async () => {
      await result.current.selectThread('thread-1');
    });
    expect(result.current.activeThreadId).toBe('thread-1');
    expect(useAgentChatStore.getState().messages).toEqual([message]);
    expect(getMessages).toHaveBeenCalledTimes(2);
  });
  it('starts a new unsaved conversation through the existing store reset', async () => {
    const { result } = renderHook(() => useAgentDockThreads(apiService, false));
    await act(async () => {
      await result.current.selectThread('thread-1');
    });
    act(() => result.current.startThread());
    expect(result.current.activeThreadId).toBeNull();
    expect(useAgentChatStore.getState().messages).toEqual([]);
    expect(result.current.threads).toHaveLength(2);
  });

  describe('master conversation', () => {
    const master: AgentThread = {
      ...makeThread('master-1', 'Master'),
      kind: AgentThreadKind.MASTER,
    };
    const getMasterThread = vi.fn(async (): Promise<AgentThread> => master);
    const apiWithMaster = { getMasterThread, getMessages, getThreads };

    beforeEach(() => {
      getMasterThread.mockClear();
      useAgentChatStore.getState().setThreads([]);
    });

    it('opens the master when the dock has no thread of its own', async () => {
      const { result } = renderHook(() =>
        useAgentDockThreads(apiWithMaster, true),
      );

      await waitFor(() =>
        expect(result.current.activeThreadId).toBe('master-1'),
      );
      expect(getMessages).toHaveBeenCalledWith('master-1', { limit: 100 });
    });

    it('keeps a thread that is already open', async () => {
      useAgentChatStore.getState().setActiveThread('thread-1');

      renderHook(() => useAgentDockThreads(apiWithMaster, true));

      await waitFor(() => expect(getThreads).toHaveBeenCalled());
      expect(getMasterThread).not.toHaveBeenCalled();
    });

    it('does not undo a blank conversation the operator asked for', async () => {
      const { result } = renderHook(() =>
        useAgentDockThreads(apiWithMaster, true),
      );
      await waitFor(() =>
        expect(result.current.activeThreadId).toBe('master-1'),
      );

      act(() => result.current.startThread());

      expect(result.current.activeThreadId).toBeNull();
      await act(async () => undefined);
      expect(getMasterThread).toHaveBeenCalledTimes(1);
      expect(result.current.activeThreadId).toBeNull();
    });

    it('leads the thread list with the master under its own name', async () => {
      getThreads.mockResolvedValue([
        makeThread('thread-1', 'Spring launch plan'),
        master,
      ]);

      const { result } = renderHook(() =>
        useAgentDockThreads(apiWithMaster, true),
      );

      await waitFor(() =>
        expect(result.current.threads.map((thread) => thread.title)).toEqual([
          'Master',
          'Spring launch plan',
        ]),
      );
    });
  });
});
