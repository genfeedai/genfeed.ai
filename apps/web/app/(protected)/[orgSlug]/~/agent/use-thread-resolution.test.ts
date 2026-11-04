import { type AgentThread, useAgentChatStore } from '@genfeedai/agent';
import { AgentThreadKind, AgentThreadStatus } from '@genfeedai/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreadResolutionApi } from '@/features/agents/props/thread-resolution.props';
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
    getThreads: vi.fn(
      async (_params?: Parameters<ThreadResolutionApi['getThreads']>[0]) =>
        archived,
    ),
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

  it('keeps loading archived pages until a short page arrives', async () => {
    const fullPage = Array.from({ length: 50 }, (_, index) =>
      makeThread(`page-1-${index}`, { status: AgentThreadStatus.ARCHIVED }),
    );
    const lastPage = [
      makeThread('page-2-0', { status: AgentThreadStatus.ARCHIVED }),
    ];
    const api = makeApi();
    api.getThreads
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce(lastPage);

    const { result } = renderHook(() => useThreadResolution(api, true));

    await waitFor(() =>
      expect(result.current.isResolved('page-2-0')).toBe(true),
    );
    expect(result.current.resolvedThreads).toHaveLength(51);
    expect(api.getThreads.mock.calls.map(([params]) => params?.page)).toEqual([
      1, 2,
    ]);
  });

  it('stops after a single request when the first page is not full', async () => {
    const api = makeApi([
      makeThread('only', { status: AgentThreadStatus.ARCHIVED }),
    ]);

    const { result } = renderHook(() => useThreadResolution(api, true));

    await waitFor(() => expect(result.current.isResolved('only')).toBe(true));
    expect(api.getThreads).toHaveBeenCalledTimes(1);
  });

  it('asks for no further page once unmounted between pages', async () => {
    const fullPage = Array.from({ length: 50 }, (_, index) =>
      makeThread(`page-1-${index}`, { status: AgentThreadStatus.ARCHIVED }),
    );
    const api = makeApi();
    let releaseFirstPage: (threads: AgentThread[]) => void = () => undefined;
    api.getThreads.mockImplementationOnce(
      () =>
        new Promise<AgentThread[]>((resolve) => {
          releaseFirstPage = resolve;
        }),
    );

    const { unmount } = renderHook(() => useThreadResolution(api, true));
    unmount();
    await act(async () => releaseFirstPage(fullPage));

    expect(api.getThreads).toHaveBeenCalledTimes(1);
  });

  it('keeps a thread reopened elsewhere active while later pages load', async () => {
    const fullPage = Array.from({ length: 50 }, (_, index) =>
      makeThread(`page-1-${index}`, { status: AgentThreadStatus.ARCHIVED }),
    );
    const api = makeApi();
    api.getThreads
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([
        makeThread('page-2-0', { status: AgentThreadStatus.ARCHIVED }),
      ]);
    useAgentChatStore.setState({
      threads: [makeThread('page-2-0', { status: AgentThreadStatus.ACTIVE })],
    });

    const { result } = renderHook(() => useThreadResolution(api, true));

    await waitFor(() => expect(api.getThreads).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.resolvedThreads).toHaveLength(50),
    );
    expect(result.current.isResolved('page-2-0')).toBe(false);
  });

  it('loads nothing until it is enabled', () => {
    const api = makeApi();

    renderHook(() => useThreadResolution(api, false));

    expect(api.getThreads).not.toHaveBeenCalled();
  });
});
