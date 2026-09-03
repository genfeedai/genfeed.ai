import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentThreadList } from './useAgentThreadList';

function makeThread(
  id: string,
  overrides: Partial<AgentThread> = {},
): AgentThread {
  return {
    contextVersion: 1,
    createdAt: '2026-03-20T10:00:00.000Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title: `Thread ${id}`,
    updatedAt: '2026-03-20T10:00:00.000Z',
    ...overrides,
  } as AgentThread;
}

interface ApiOverrides {
  [key: string]: ReturnType<typeof vi.fn>;
}

function makeApiService(overrides: ApiOverrides = {}): AgentApiService {
  return {
    archiveAllThreads: vi.fn().mockResolvedValue(undefined),
    archiveThread: vi.fn((id: string) =>
      Promise.resolve(makeThread(id, { status: AgentThreadStatus.ARCHIVED })),
    ),
    branchThread: vi.fn(() => Promise.resolve(makeThread('branched-1'))),
    getMessages: vi.fn().mockResolvedValue([]),
    getThread: vi.fn((id: string) =>
      Promise.resolve(makeThread(id, { systemPrompt: 'be nice' } as never)),
    ),
    getThreads: vi.fn(() => Promise.resolve([makeThread('t-1')])),
    pinThread: vi.fn((id: string) =>
      Promise.resolve(makeThread(id, { isPinned: true })),
    ),
    unarchiveThread: vi.fn((id: string) => Promise.resolve(makeThread(id))),
    unpinThread: vi.fn((id: string) =>
      Promise.resolve(makeThread(id, { isPinned: false })),
    ),
    updateThread: vi.fn((id: string, patch: { title: string }) =>
      Promise.resolve(makeThread(id, { title: patch.title })),
    ),
    ...overrides,
  } as unknown as AgentApiService;
}

function renderThreadList(
  apiService: AgentApiService,
  options: {
    brandId?: string | null;
    onNavigate?: (path: string) => void;
    resolveThreadHref?: (thread: AgentThread) => string;
  } = {},
) {
  return renderHook(() =>
    useAgentThreadList({
      apiService,
      brandId: options.brandId ?? null,
      isActive: true,
      onNavigate: options.onNavigate,
      resolveThreadHref: options.resolveThreadHref,
    }),
  );
}

describe('useAgentThreadList', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it('loads threads on mount and splits pinned from regular', async () => {
    const apiService = makeApiService({
      getThreads: vi
        .fn()
        .mockResolvedValue([
          makeThread('t-1', { isPinned: true }),
          makeThread('t-2'),
        ]),
    });

    const { result } = renderThreadList(apiService);

    await waitFor(() => expect(result.current.threads).toHaveLength(2));
    expect(result.current.pinnedThreads.map((t) => t.id)).toEqual(['t-1']);
    expect(result.current.regularThreads.map((t) => t.id)).toEqual(['t-2']);
    expect(result.current.shouldShowEmptyState).toBe(false);
    expect(result.current.shouldShowHeader).toBe(true);
  });

  it('shows the empty state when the API returns nothing', async () => {
    const apiService = makeApiService({
      getThreads: vi.fn().mockResolvedValue([]),
    });

    const { result } = renderThreadList(apiService);

    await waitFor(() => expect(result.current.shouldShowEmptyState).toBe(true));
  });

  it('handleSelect loads messages and the thread prompt', async () => {
    const messages = [
      {
        content: 'hi',
        createdAt: '2026-03-20T10:00:00.000Z',
        id: 'm-1',
        role: 'assistant',
        threadId: 't-1',
      },
    ];
    const apiService = makeApiService({
      getMessages: vi.fn().mockResolvedValue(messages),
    });
    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => {
      await result.current.handleSelect(makeThread('t-1'));
    });

    expect(useAgentChatStore.getState().activeThreadId).toBe('t-1');
    expect(useAgentChatStore.getState().messages).toEqual(messages);
    expect(useAgentChatStore.getState().threadPrompts['t-1']).toBe('be nice');
  });

  it('handleSelect navigates instead of loading when onNavigate is provided', async () => {
    const onNavigate = vi.fn();
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService, {
      onNavigate,
      resolveThreadHref: (thread) => `/acme/moonrise/agent/${thread.id}`,
    });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => {
      await result.current.handleSelect(makeThread('t-1'));
    });

    expect(onNavigate).toHaveBeenCalledWith('/acme/moonrise/agent/t-1');
    expect(apiService.getMessages).not.toHaveBeenCalled();
    expect(useAgentChatStore.getState().activeThreadId).toBeNull();
  });

  it('paints a cached target before the route transition commits', async () => {
    const onNavigate = vi.fn();
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService, {
      onNavigate,
      resolveThreadHref: (thread) => `/acme/moonrise/agent/${thread.id}`,
    });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    act(() => {
      useAgentChatStore.getState().primeConversationCache('t-1', {
        error: null,
        hasMoreMessages: false,
        latestProposedPlan: null,
        messages: [
          {
            content: 'prefetched reply',
            createdAt: '2026-03-20T10:00:00.000Z',
            id: 'm-prefetched',
            role: 'assistant',
            threadId: 't-1',
          },
        ],
        messagesCursor: null,
        pendingInputRequest: null,
        workEvents: [],
      });
    });

    await act(async () => {
      await result.current.handleSelect(makeThread('t-1'));
    });

    expect(useAgentChatStore.getState().activeThreadId).toBe('t-1');
    expect(useAgentChatStore.getState().messages[0]?.content).toBe(
      'prefetched reply',
    );
    expect(onNavigate).toHaveBeenCalledWith('/acme/moonrise/agent/t-1');
    expect(apiService.getMessages).not.toHaveBeenCalled();
  });

  it('handleSelect is a no-op for the already-active thread', async () => {
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    act(() => {
      useAgentChatStore.getState().setActiveThread('t-1');
    });

    await act(async () => {
      await result.current.handleSelect(makeThread('t-1'));
    });

    expect(apiService.getMessages).not.toHaveBeenCalled();
  });

  it('archives an inactive thread and removes it from the list', async () => {
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => {
      await result.current.handleArchiveFromMenu(makeThread('t-1'));
    });

    expect(apiService.archiveThread).toHaveBeenCalledWith('t-1');
    expect(useAgentChatStore.getState().threads).toHaveLength(0);
  });

  it('archiving the active thread keeps it with archived status and navigates away', async () => {
    const onNavigate = vi.fn();
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService, { onNavigate });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    act(() => {
      useAgentChatStore.getState().setActiveThread('t-1');
    });

    await act(async () => {
      await result.current.handleArchiveFromMenu(makeThread('t-1'));
    });

    expect(useAgentChatStore.getState().threads[0]?.status).toBe(
      AgentThreadStatus.ARCHIVED,
    );
    expect(onNavigate).toHaveBeenCalledWith('/agent/new');
  });

  it('unarchive removes the thread from the archived list', async () => {
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => {
      await result.current.handleUnarchiveFromMenu(makeThread('t-1'));
    });

    expect(apiService.unarchiveThread).toHaveBeenCalledWith('t-1');
    expect(useAgentChatStore.getState().threads).toHaveLength(0);
  });

  it('fork navigates to the branched thread', async () => {
    const onNavigate = vi.fn();
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService, { onNavigate });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => {
      await result.current.handleForkThread(makeThread('t-1'));
    });

    expect(apiService.branchThread).toHaveBeenCalledWith('t-1');
    expect(onNavigate).toHaveBeenCalledWith('/agent/branched-1');
    expect(
      useAgentChatStore.getState().threads.map((thread) => thread.id),
    ).toContain('branched-1');
  });

  it('fork without navigation activates the branched thread locally', async () => {
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => {
      await result.current.handleForkThread(makeThread('t-1'));
    });

    expect(useAgentChatStore.getState().activeThreadId).toBe('branched-1');
  });

  it('toggles pinning through the pin/unpin effects', async () => {
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => {
      await result.current.handleTogglePinned(makeThread('t-1'));
    });
    expect(apiService.pinThread).toHaveBeenCalledWith('t-1');
    expect(useAgentChatStore.getState().threads[0]?.isPinned).toBe(true);

    await act(async () => {
      await result.current.handleTogglePinned(
        makeThread('t-1', { isPinned: true }),
      );
    });
    expect(apiService.unpinThread).toHaveBeenCalledWith('t-1');
  });

  it('archive all clears the list and navigates when the active thread dies', async () => {
    const onNavigate = vi.fn();
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService, { onNavigate });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    act(() => {
      useAgentChatStore.getState().setActiveThread('t-1');
    });

    await act(async () => {
      await result.current.handleArchiveAllThreads();
    });

    expect(apiService.archiveAllThreads).toHaveBeenCalled();
    expect(useAgentChatStore.getState().threads).toHaveLength(0);
    expect(onNavigate).toHaveBeenCalledWith('/agent/new');
  });

  it('rename lifecycle updates the thread title', async () => {
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    act(() => {
      result.current.handleStartRename(makeThread('t-1'));
    });
    expect(result.current.renamingThreadId).toBe('t-1');
    expect(result.current.renameDraft).toBe('Thread t-1');

    act(() => {
      result.current.setRenameDraft('Better title');
    });
    await act(async () => {
      await result.current.handleSubmitRename(makeThread('t-1'));
    });

    expect(apiService.updateThread).toHaveBeenCalledWith('t-1', {
      title: 'Better title',
    });
    expect(useAgentChatStore.getState().threads[0]?.title).toBe('Better title');
    expect(result.current.renamingThreadId).toBeNull();
  });

  it('rename with an unchanged title cancels silently', async () => {
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    act(() => {
      result.current.handleStartRename(makeThread('t-1'));
    });
    await act(async () => {
      await result.current.handleSubmitRename(makeThread('t-1'));
    });

    expect(apiService.updateThread).not.toHaveBeenCalled();
  });

  it('handleToggleView flips between active and archived', async () => {
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    expect(result.current.isArchivedView).toBe(false);
    act(() => {
      result.current.handleToggleView();
    });
    expect(result.current.viewStatus).toBe(AgentThreadStatus.ARCHIVED);
    expect(result.current.isArchivedView).toBe(true);
  });

  it('auto-switches to archived view when the open thread is archived', async () => {
    useAgentChatStore.setState({
      activeThreadId: 'archived-open',
      threads: [
        makeThread('archived-open', {
          brandId: 'brand-1',
          status: AgentThreadStatus.ARCHIVED,
        }),
      ],
    });

    const apiService = makeApiService({
      getThreads: vi.fn().mockResolvedValue([
        makeThread('archived-open', {
          brandId: 'brand-1',
          status: AgentThreadStatus.ARCHIVED,
        }),
      ]),
    });

    const { result } = renderThreadList(apiService, { brandId: 'brand-1' });

    await waitFor(() =>
      expect(result.current.viewStatus).toBe(AgentThreadStatus.ARCHIVED),
    );
    expect(result.current.isArchivedView).toBe(true);
    await waitFor(() =>
      expect(result.current.threads.some((t) => t.id === 'archived-open')).toBe(
        true,
      ),
    );
  });

  it('keeps Recent after the operator toggles even when the open thread is archived', async () => {
    useAgentChatStore.setState({
      activeThreadId: 'archived-open',
      threads: [
        makeThread('archived-open', {
          brandId: 'brand-1',
          status: AgentThreadStatus.ARCHIVED,
        }),
      ],
    });

    const apiService = makeApiService({
      getThreads: vi.fn((params?: { status?: string }) => {
        if (params?.status === AgentThreadStatus.ARCHIVED) {
          return Promise.resolve([
            makeThread('archived-open', {
              brandId: 'brand-1',
              status: AgentThreadStatus.ARCHIVED,
            }),
          ]);
        }
        return Promise.resolve([
          makeThread('active-1', {
            brandId: 'brand-1',
            status: AgentThreadStatus.ACTIVE,
          }),
        ]);
      }),
    });

    const { result } = renderThreadList(apiService, { brandId: 'brand-1' });

    await waitFor(() =>
      expect(result.current.viewStatus).toBe(AgentThreadStatus.ARCHIVED),
    );

    act(() => {
      result.current.handleToggleView();
    });

    await waitFor(() =>
      expect(result.current.viewStatus).toBe(AgentThreadStatus.ACTIVE),
    );
    // Must not bounce back to Archived while the same thread stays open.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.viewStatus).toBe(AgentThreadStatus.ACTIVE);
    expect(result.current.isArchivedView).toBe(false);
  });

  it('returns to Recent when an active thread is opened after an archived one', async () => {
    useAgentChatStore.setState({
      activeThreadId: 'archived-open',
      threads: [
        makeThread('archived-open', {
          brandId: 'brand-1',
          status: AgentThreadStatus.ARCHIVED,
        }),
      ],
    });

    const apiService = makeApiService({
      getThreads: vi.fn((params?: { status?: string }) =>
        Promise.resolve(
          params?.status === AgentThreadStatus.ARCHIVED
            ? [
                makeThread('archived-open', {
                  brandId: 'brand-1',
                  status: AgentThreadStatus.ARCHIVED,
                }),
              ]
            : [
                makeThread('active-1', {
                  brandId: 'brand-1',
                  status: AgentThreadStatus.ACTIVE,
                }),
              ],
        ),
      ),
    });

    const { result } = renderThreadList(apiService, { brandId: 'brand-1' });

    await waitFor(() =>
      expect(result.current.viewStatus).toBe(AgentThreadStatus.ARCHIVED),
    );

    act(() => {
      useAgentChatStore.setState({
        activeThreadId: 'active-1',
        threads: [
          makeThread('active-1', {
            brandId: 'brand-1',
            status: AgentThreadStatus.ACTIVE,
          }),
        ],
      });
    });

    await waitFor(() =>
      expect(result.current.viewStatus).toBe(AgentThreadStatus.ACTIVE),
    );
    expect(result.current.isArchivedView).toBe(false);
  });

  it('keeps an archived open thread out of a pinned Recent list', async () => {
    useAgentChatStore.setState({
      activeThreadId: 'archived-open',
      threads: [
        makeThread('archived-open', {
          brandId: 'brand-1',
          status: AgentThreadStatus.ARCHIVED,
        }),
      ],
    });

    const apiService = makeApiService({
      getThreads: vi.fn((params?: { status?: string }) =>
        Promise.resolve(
          params?.status === AgentThreadStatus.ARCHIVED
            ? [
                makeThread('archived-open', {
                  brandId: 'brand-1',
                  status: AgentThreadStatus.ARCHIVED,
                }),
              ]
            : [
                makeThread('active-1', {
                  brandId: 'brand-1',
                  status: AgentThreadStatus.ACTIVE,
                }),
              ],
        ),
      ),
    });

    const { result } = renderThreadList(apiService, { brandId: 'brand-1' });

    await waitFor(() =>
      expect(result.current.viewStatus).toBe(AgentThreadStatus.ARCHIVED),
    );

    act(() => {
      result.current.handleToggleView();
    });

    await waitFor(() =>
      expect(result.current.viewStatus).toBe(AgentThreadStatus.ACTIVE),
    );
    await waitFor(() =>
      expect(result.current.threads.map((t) => t.id)).toEqual(['active-1']),
    );
  });

  it('shows a store upsert title immediately without refetching conversations', async () => {
    const getThreads = vi.fn().mockResolvedValue([makeThread('t-1')]);
    const apiService = makeApiService({ getThreads });

    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(getThreads).toHaveBeenCalledTimes(1);

    act(() => {
      useAgentChatStore.getState().upsertThread(
        makeThread('t-send', {
          title: 'Visible from send',
          updatedAt: '2026-03-20T12:00:00.000Z',
        }),
      );
    });

    expect(result.current.threads[0]?.title).toBe('Visible from send');
    expect(result.current.threads.map((thread) => thread.id)).toContain(
      't-send',
    );
    expect(getThreads).toHaveBeenCalledTimes(1);
  });

  it('reorders the list from a store finalize write without refetching', async () => {
    const getThreads = vi.fn().mockResolvedValue([
      makeThread('stale', {
        title: 'Stale',
        updatedAt: '2026-03-20T08:00:00.000Z',
      }),
      makeThread('fresh', {
        title: 'Fresh',
        updatedAt: '2026-03-20T11:00:00.000Z',
      }),
    ]);
    const apiService = makeApiService({ getThreads });

    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(2));
    expect(getThreads).toHaveBeenCalledTimes(1);

    act(() => {
      useAgentChatStore.getState().updateThread('stale', {
        lastActivityAt: '2026-03-20T12:00:00.000Z',
        runStatus: 'completed',
      });
    });

    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      'stale',
      'fresh',
    ]);
    expect(getThreads).toHaveBeenCalledTimes(1);
  });

  it('ignores the retired window refresh event and only refetches from handleRefresh', async () => {
    const getThreads = vi.fn().mockResolvedValue([makeThread('t-1')]);
    const apiService = makeApiService({ getThreads });

    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(getThreads).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('agent:threads:refresh'));
      window.dispatchEvent(new Event('agent:threads:refresh'));
    });

    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 200);
        }),
    );
    expect(getThreads).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.handleRefresh();
    });
    expect(getThreads).toHaveBeenCalledTimes(2);
  });

  it('surfaces load failures with a retry state', async () => {
    const apiService = makeApiService({
      getThreads: vi.fn().mockRejectedValue(new Error('network down')),
    });

    const { result } = renderThreadList(apiService);

    await waitFor(() =>
      expect(result.current.shouldShowLoadFailureState).toBe(true),
    );
    expect(result.current.loadError).toBeTruthy();
  });

  it('brand scope filters out threads from other brands', async () => {
    const apiService = makeApiService({
      getThreads: vi
        .fn()
        .mockResolvedValue([
          makeThread('t-1', { brandId: 'brand-1' } as never),
          makeThread('t-2', { brandId: 'brand-2' } as never),
        ]),
    });

    const { result } = renderThreadList(apiService, { brandId: 'brand-1' });

    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.threads[0]?.id).toBe('t-1');
  });
});
