import { type AgentThread, useAgentChatStore } from '@genfeedai/agent';
import { AgentThreadKind, AgentThreadStatus } from '@genfeedai/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThreadResolution } from './use-thread-resolution';

function makeThread(
  id: string,
  overrides: Partial<AgentThread> = {},
): AgentThread {
  return {
    contextVersion: 1,
    createdAt: '2026-11-01T08:00:00Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title: id,
    updatedAt: '2026-11-01T08:00:00Z',
    ...overrides,
  };
}

function makeApi(archived: AgentThread[] = []) {
  return {
    archiveThread: vi.fn(async (threadId: string) =>
      makeThread(threadId, { status: AgentThreadStatus.ARCHIVED }),
    ),
    getThreads: vi.fn(async () => archived),
    unarchiveThread: vi.fn(async (threadId: string) =>
      makeThread(threadId, { status: AgentThreadStatus.ACTIVE }),
    ),
  };
}

describe('useThreadResolution', () => {
  beforeEach(() => {
    useAgentChatStore.setState({
      threads: [makeThread('review'), makeThread('working')],
    });
  });

  it('starts from the threads already archived, never the master', async () => {
    const api = makeApi([
      makeThread('shipped', { status: AgentThreadStatus.ARCHIVED }),
      makeThread('master', {
        kind: AgentThreadKind.MASTER,
        status: AgentThreadStatus.ARCHIVED,
      }),
    ]);

    const { result } = renderHook(() => useThreadResolution(api, true));

    await waitFor(() =>
      expect(result.current.isResolved('shipped')).toBe(true),
    );
    expect(result.current.resolvedThreads.map((thread) => thread.id)).toEqual([
      'shipped',
    ]);
    expect(result.current.isResolved('review')).toBe(false);
  });

  it('resolves a thread for the panel and the cards alike, then reopens it', async () => {
    const api = makeApi();
    const { result } = renderHook(() => useThreadResolution(api, true));

    await act(() => result.current.resolveThread('review'));

    expect(result.current.isResolved('review')).toBe(true);
    expect(result.current.resolvedThreads.map((thread) => thread.id)).toEqual([
      'review',
    ]);
    expect(
      useAgentChatStore
        .getState()
        .threads.find((thread) => thread.id === 'review')?.status,
    ).toBe(AgentThreadStatus.ARCHIVED);

    await act(() => result.current.reopenThread('review'));

    expect(result.current.isResolved('review')).toBe(false);
    expect(result.current.resolvedThreads).toEqual([]);
    expect(
      useAgentChatStore
        .getState()
        .threads.find((thread) => thread.id === 'review')?.status,
    ).toBe(AgentThreadStatus.ACTIVE);
  });

  it('leaves the thread active when the server refuses', async () => {
    const api = makeApi();
    api.archiveThread.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useThreadResolution(api, true));

    await act(() => result.current.resolveThread('review'));

    expect(result.current.isResolved('review')).toBe(false);
    expect(result.current.isPending('review')).toBe(false);
  });

  it('loads nothing until it is enabled', () => {
    const api = makeApi();

    renderHook(() => useThreadResolution(api, false));

    expect(api.getThreads).not.toHaveBeenCalled();
  });
});
