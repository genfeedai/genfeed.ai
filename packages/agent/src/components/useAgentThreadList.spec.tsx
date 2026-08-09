import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/enums';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
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
    archiveAllThreadsEffect: vi.fn(() => Effect.succeed(undefined)),
    archiveThreadEffect: vi.fn((id: string) =>
      Effect.succeed(makeThread(id, { status: AgentThreadStatus.ARCHIVED })),
    ),
    branchThreadEffect: vi.fn(() => Effect.succeed(makeThread('branched-1'))),
    getMessagesEffect: vi.fn(() => Effect.succeed([])),
    getThreadEffect: vi.fn((id: string) =>
      Effect.succeed(makeThread(id, { systemPrompt: 'be nice' } as never)),
    ),
    getThreadsEffect: vi.fn(() => Effect.succeed([makeThread('t-1')])),
    pinThreadEffect: vi.fn((id: string) =>
      Effect.succeed(makeThread(id, { isPinned: true })),
    ),
    unarchiveThreadEffect: vi.fn((id: string) =>
      Effect.succeed(makeThread(id)),
    ),
    unpinThreadEffect: vi.fn((id: string) =>
      Effect.succeed(makeThread(id, { isPinned: false })),
    ),
    updateThreadEffect: vi.fn((id: string, patch: { title: string }) =>
      Effect.succeed(makeThread(id, { title: patch.title })),
    ),
    ...overrides,
  } as unknown as AgentApiService;
}

function renderThreadList(
  apiService: AgentApiService,
  options: {
    brandId?: string | null;
    onNavigate?: (path: string) => void;
  } = {},
) {
  return renderHook(() =>
    useAgentThreadList({
      apiService,
      brandId: options.brandId ?? null,
      isActive: true,
      onNavigate: options.onNavigate,
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
      getThreadsEffect: vi.fn(() =>
        Effect.succeed([
          makeThread('t-1', { isPinned: true }),
          makeThread('t-2'),
        ]),
      ),
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
      getThreadsEffect: vi.fn(() => Effect.succeed([])),
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
      getMessagesEffect: vi.fn(() => Effect.succeed(messages)),
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
    const { result } = renderThreadList(apiService, { onNavigate });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => {
      await result.current.handleSelect(makeThread('t-1'));
    });

    expect(onNavigate).toHaveBeenCalledWith('/agent/t-1');
    expect(apiService.getMessagesEffect).not.toHaveBeenCalled();
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

    expect(apiService.getMessagesEffect).not.toHaveBeenCalled();
  });

  it('archives an inactive thread and removes it from the list', async () => {
    const apiService = makeApiService();
    const { result } = renderThreadList(apiService);
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => {
      await result.current.handleArchiveFromMenu(makeThread('t-1'));
    });

    expect(apiService.archiveThreadEffect).toHaveBeenCalledWith('t-1');
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

    expect(apiService.unarchiveThreadEffect).toHaveBeenCalledWith('t-1');
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

    expect(apiService.branchThreadEffect).toHaveBeenCalledWith('t-1');
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
    expect(apiService.pinThreadEffect).toHaveBeenCalledWith('t-1');
    expect(useAgentChatStore.getState().threads[0]?.isPinned).toBe(true);

    await act(async () => {
      await result.current.handleTogglePinned(
        makeThread('t-1', { isPinned: true }),
      );
    });
    expect(apiService.unpinThreadEffect).toHaveBeenCalledWith('t-1');
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

    expect(apiService.archiveAllThreadsEffect).toHaveBeenCalled();
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

    expect(apiService.updateThreadEffect).toHaveBeenCalledWith('t-1', {
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

    expect(apiService.updateThreadEffect).not.toHaveBeenCalled();
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

  it('surfaces load failures with a retry state', async () => {
    const apiService = makeApiService({
      getThreadsEffect: vi.fn(() => Effect.fail(new Error('network down'))),
    });

    const { result } = renderThreadList(apiService);

    await waitFor(() =>
      expect(result.current.shouldShowLoadFailureState).toBe(true),
    );
    expect(result.current.loadError).toBeTruthy();
  });

  it('brand scope filters out threads from other brands', async () => {
    const apiService = makeApiService({
      getThreadsEffect: vi.fn(() =>
        Effect.succeed([
          makeThread('t-1', { brandId: 'brand-1' } as never),
          makeThread('t-2', { brandId: 'brand-2' } as never),
        ]),
      ),
    });

    const { result } = renderThreadList(apiService, { brandId: 'brand-1' });

    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.threads[0]?.id).toBe('t-1');
  });
});
