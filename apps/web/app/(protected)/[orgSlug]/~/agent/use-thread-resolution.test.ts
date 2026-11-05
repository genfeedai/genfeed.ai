import { type AgentThread, useAgentChatStore } from '@genfeedai/agent';
import { AgentThreadKind, AgentThreadStatus } from '@genfeedai/contracts';
import { logger } from '@genfeedai/services/core/logger.service';
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

function makeArchivedPage(page: number | undefined): AgentThread[] {
  return Array.from({ length: 50 }, (_, index) =>
    makeThread(`page-${page}-${index}`, {
      status: AgentThreadStatus.ARCHIVED,
    }),
  );
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

  it('stops at the 100-page cap when every page comes back full', async () => {
    const api = makeApi();
    api.getThreads.mockImplementation(async (params) =>
      makeArchivedPage(params?.page),
    );

    const { result } = renderHook(() => useThreadResolution(api, true));

    await waitFor(() =>
      expect(result.current.resolvedThreads).toHaveLength(5000),
    );
    // Give a 101st page every chance to be asked for and land.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(result.current.resolvedThreads).toHaveLength(5000);
    expect(result.current.isResolved('page-100-49')).toBe(true);
    expect(api.getThreads).toHaveBeenCalledTimes(100);
    expect(api.getThreads.mock.calls.at(-1)?.[0]?.page).toBe(100);
    expect(result.current.hasMoreResolved).toBe(true);
  });

  it('pages past the cap on demand until a short page ends the list', async () => {
    const api = makeApi();
    api.getThreads.mockImplementation(async (params) =>
      params?.page === 102
        ? [makeThread('page-102-0', { status: AgentThreadStatus.ARCHIVED })]
        : makeArchivedPage(params?.page),
    );
    const { result } = renderHook(() => useThreadResolution(api, true));
    await waitFor(() => expect(result.current.hasMoreResolved).toBe(true));

    await act(() => result.current.loadMoreResolved());

    expect(result.current.resolvedThreads).toHaveLength(5050);
    expect(result.current.isResolved('page-101-49')).toBe(true);
    expect(result.current.hasMoreResolved).toBe(true);

    await act(() => result.current.loadMoreResolved());

    expect(result.current.resolvedThreads).toHaveLength(5051);
    expect(result.current.isResolved('page-102-0')).toBe(true);
    expect(result.current.hasMoreResolved).toBe(false);
    expect(
      api.getThreads.mock.calls.slice(100).map(([params]) => params?.page),
    ).toEqual([101, 102]);
  });

  it('offers no further page when the list ends inside the cap', async () => {
    const api = makeApi([
      makeThread('only', { status: AgentThreadStatus.ARCHIVED }),
    ]);
    const { result } = renderHook(() => useThreadResolution(api, true));
    await waitFor(() => expect(result.current.isResolved('only')).toBe(true));

    await act(() => result.current.loadMoreResolved());

    expect(result.current.hasMoreResolved).toBe(false);
    expect(api.getThreads).toHaveBeenCalledTimes(1);
  });

  it('retries the page that failed when the operator loads more', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const api = makeApi();
    api.getThreads
      .mockResolvedValueOnce(makeArchivedPage(1))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([
        makeThread('page-2-0', { status: AgentThreadStatus.ARCHIVED }),
      ]);
    const { result } = renderHook(() => useThreadResolution(api, true));
    await waitFor(() => expect(result.current.hasMoreResolved).toBe(true));

    await act(() => result.current.loadMoreResolved());

    expect(result.current.isResolved('page-2-0')).toBe(true);
    expect(result.current.resolvedThreads).toHaveLength(51);
    expect(result.current.hasMoreResolved).toBe(false);
    expect(api.getThreads.mock.calls.map(([params]) => params?.page)).toEqual([
      1, 2, 2,
    ]);
    error.mockRestore();
  });

  it('keeps what it has and still offers the page when loading more fails', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const api = makeApi();
    api.getThreads.mockImplementation(async (params) => {
      if (params?.page === 101) {
        throw new Error('offline');
      }
      return makeArchivedPage(params?.page);
    });
    const { result } = renderHook(() => useThreadResolution(api, true));
    await waitFor(() => expect(result.current.hasMoreResolved).toBe(true));

    await act(() => result.current.loadMoreResolved());

    expect(result.current.resolvedThreads).toHaveLength(5000);
    expect(result.current.hasMoreResolved).toBe(true);
    expect(result.current.isLoadingMoreResolved).toBe(false);
    expect(error).toHaveBeenCalledWith('Failed to load more resolved threads', {
      error: new Error('offline'),
      page: 101,
    });
    error.mockRestore();
  });

  it('keeps the pages already loaded and logs when a later page fails', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const api = makeApi();
    api.getThreads
      .mockResolvedValueOnce(makeArchivedPage(1))
      .mockRejectedValueOnce(new Error('offline'));

    const { result } = renderHook(() => useThreadResolution(api, true));

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Failed to load resolved threads', {
        error: new Error('offline'),
      }),
    );
    expect(result.current.resolvedThreads).toHaveLength(50);
    expect(result.current.isResolved('page-1-0')).toBe(true);
    expect(api.getThreads).toHaveBeenCalledTimes(2);
    error.mockRestore();
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
