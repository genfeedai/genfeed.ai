import { AGENT_MESSAGE_PAGE_SIZE } from '@genfeedai/agent/constants/agent-message-pagination.constant';
import type {
  AgentChatMessage,
  AgentThreadSnapshot,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { conversationHydrationFlights } from '@genfeedai/agent/utils/conversation-hydration-flight';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentThreadPrefetch } from './useAgentThreadPrefetch';

function makeMessages(threadId: string): AgentChatMessage[] {
  return [
    {
      content: `Hello from ${threadId}`,
      createdAt: '2026-03-20T10:00:00.000Z',
      id: `msg-${threadId}`,
      role: 'assistant',
      threadId,
    } as AgentChatMessage,
  ];
}

function makeMessagesPage(threadId: string) {
  return {
    hasMore: true,
    messages: makeMessages(threadId),
    nextCursor: `cursor-${threadId}`,
  };
}

function makeSnapshot(threadId: string): AgentThreadSnapshot {
  return {
    activeRun: null,
    lastAssistantMessage: null,
    lastSequence: 0,
    latestProposedPlan: null,
    latestUiBlocks: null,
    memorySummaryRefs: [],
    pendingApprovals: [],
    pendingInputRequests: [],
    profileSnapshot: null,
    sessionBinding: null,
    source: 'agent',
    threadId,
    threadStatus: 'active',
    timeline: [],
    title: `Thread ${threadId}`,
  };
}

interface ApiOverrides {
  [key: string]: ReturnType<typeof vi.fn>;
}

function makeApiService(overrides: ApiOverrides = {}): AgentApiService {
  return {
    getMessagesPage: vi.fn((threadId: string) =>
      Promise.resolve(makeMessagesPage(threadId)),
    ),
    getThreadSnapshot: vi.fn((threadId: string) =>
      Promise.resolve(makeSnapshot(threadId)),
    ),
    ...overrides,
  } as unknown as AgentApiService;
}

describe('useAgentThreadPrefetch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  afterEach(() => {
    conversationHydrationFlights.clear();
    vi.useRealTimers();
  });

  it('debounces hover so a sweep across rows only fetches the settled target', async () => {
    const apiService = makeApiService();
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    act(() => {
      result.current.prefetchThread('thread-a');
      vi.advanceTimersByTime(50);
      result.current.prefetchThread('thread-b');
      vi.advanceTimersByTime(50);
      result.current.prefetchThread('thread-c');
    });

    expect(apiService.getMessagesPage).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(150);
      await vi.runOnlyPendingTimersAsync();
    });

    expect(apiService.getMessagesPage).toHaveBeenCalledTimes(1);
    expect(apiService.getMessagesPage).toHaveBeenCalledWith(
      'thread-c',
      { limit: AGENT_MESSAGE_PAGE_SIZE },
      expect.any(AbortSignal),
    );
  });

  it('does not stack duplicate in-flight fetches for repeated hovers of the same thread', async () => {
    const apiService = makeApiService();
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    act(() => {
      result.current.prefetchThread('thread-a');
      vi.advanceTimersByTime(150);
    });
    act(() => {
      result.current.prefetchThread('thread-a');
      vi.advanceTimersByTime(150);
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(apiService.getMessagesPage).toHaveBeenCalledTimes(1);
  });

  it('primes the conversation cache with the fetched messages and snapshot', async () => {
    const apiService = makeApiService();
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    act(() => {
      result.current.prefetchThread('thread-a');
      vi.advanceTimersByTime(150);
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    await waitFor(() => {
      expect(
        useAgentChatStore.getState().conversationCacheByThread['thread-a'],
      ).toBeDefined();
    });

    const cached =
      useAgentChatStore.getState().conversationCacheByThread['thread-a'];
    expect(cached?.messages).toEqual(makeMessages('thread-a'));
    expect(cached?.error).toBeNull();
    expect(cached?.hasMoreMessages).toBe(true);
    expect(cached?.messagesCursor).toBe('cursor-thread-a');
    expect(cached?.latestProposedPlan).toBeNull();
    expect(cached?.pendingInputRequest).toBeNull();
    expect(cached?.workEvents).toEqual([]);
  });

  it('primes and restores the terminal error from a failed snapshot', async () => {
    const apiService = makeApiService({
      getThreadSnapshot: vi.fn((threadId: string) =>
        Promise.resolve({
          ...makeSnapshot(threadId),
          activeRun: { runId: 'run-failed', status: 'failed' },
          lastSequence: 1,
          timeline: [
            {
              createdAt: '2026-08-28T17:01:00.000Z',
              detail: 'Provider authentication failed',
              id: 'failure-1',
              kind: 'error' as const,
              label: 'Agent error',
              runId: 'run-failed',
              sequence: 1,
              status: 'failed',
            },
          ],
        }),
      ),
    });
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    act(() => {
      result.current.prefetchThread('thread-failed');
      vi.advanceTimersByTime(150);
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(
      useAgentChatStore.getState().restoreCachedConversation('thread-failed'),
    ).toBe(true);
    expect(useAgentChatStore.getState().error).toBe(
      'Provider authentication failed',
    );
  });

  it('aborts the in-flight fetch for a thread superseded by a newer hover', async () => {
    let capturedSignal: AbortSignal | undefined;
    const apiService = makeApiService({
      getMessagesPage: vi.fn(
        (threadId: string, _params, signal?: AbortSignal) => {
          if (threadId === 'thread-a') {
            capturedSignal = signal;
          }
          return new Promise<ReturnType<typeof makeMessagesPage>>((resolve) => {
            // Never resolves within the test — only the abort matters.
            signal?.addEventListener('abort', () =>
              resolve({ hasMore: false, messages: [], nextCursor: null }),
            );
          });
        },
      ),
    });
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    act(() => {
      result.current.prefetchThread('thread-a');
      vi.advanceTimersByTime(150);
    });

    expect(capturedSignal?.aborted).toBe(false);

    act(() => {
      result.current.prefetchThread('thread-b');
    });

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('cancelPrefetch aborts a pending debounce before it fires', async () => {
    const apiService = makeApiService();
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    act(() => {
      result.current.prefetchThread('thread-a');
      result.current.cancelPrefetch();
      vi.advanceTimersByTime(150);
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(apiService.getMessagesPage).not.toHaveBeenCalled();
  });

  it('cancelPrefetch scoped to a threadId ignores a stale pointer-leave for a superseded row', async () => {
    const apiService = makeApiService();
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    act(() => {
      result.current.prefetchThread('thread-a');
      // A newer hover supersedes thread-a before the stale pointer-leave for
      // thread-a arrives.
      result.current.prefetchThread('thread-b');
      // Stale cancel for the row the pointer already left — must not cancel
      // the newer pending thread-b prefetch.
      result.current.cancelPrefetch('thread-a');
      vi.advanceTimersByTime(150);
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(apiService.getMessagesPage).toHaveBeenCalledTimes(1);
    expect(apiService.getMessagesPage).toHaveBeenCalledWith(
      'thread-b',
      { limit: AGENT_MESSAGE_PAGE_SIZE },
      expect.any(AbortSignal),
    );
  });

  it('never prefetches the currently active thread', async () => {
    act(() => {
      useAgentChatStore.getState().setActiveThread('thread-a');
    });
    const apiService = makeApiService();
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    act(() => {
      result.current.prefetchThread('thread-a');
      vi.advanceTimersByTime(150);
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(apiService.getMessagesPage).not.toHaveBeenCalled();
  });

  it('never overwrites an already-fresh cache entry for the target thread', async () => {
    act(() => {
      useAgentChatStore.getState().primeConversationCache('thread-a', {
        error: null,
        hasMoreMessages: true,
        latestProposedPlan: null,
        messages: makeMessages('thread-a'),
        messagesCursor: 'cursor-thread-a',
        pendingInputRequest: null,
        workEvents: [],
      });
    });
    const apiService = makeApiService();
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    act(() => {
      result.current.prefetchThread('thread-a');
      vi.advanceTimersByTime(150);
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(apiService.getMessagesPage).not.toHaveBeenCalled();
  });

  it('refetches once a previously-cached entry expires past the freshness window', async () => {
    act(() => {
      useAgentChatStore.getState().primeConversationCache('thread-a', {
        error: null,
        hasMoreMessages: true,
        latestProposedPlan: null,
        messages: makeMessages('thread-a'),
        messagesCursor: 'cursor-thread-a',
        pendingInputRequest: null,
        workEvents: [],
      });
    });
    const apiService = makeApiService();
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    // Freshness window is CONVERSATION_CACHE_FRESHNESS_MS (20s) — advance
    // past it so the entry is stale by the time the hover debounce fires.
    await act(async () => {
      vi.advanceTimersByTime(21_000);
    });

    act(() => {
      result.current.prefetchThread('thread-a');
      vi.advanceTimersByTime(150);
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(apiService.getMessagesPage).toHaveBeenCalledTimes(1);
  });

  it('does not abort an in-flight prefetch after the thread becomes active', async () => {
    let capturedSignal: AbortSignal | undefined;
    const apiService = makeApiService({
      getMessagesPage: vi.fn(
        (_threadId: string, _params, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise<ReturnType<typeof makeMessagesPage>>((resolve) => {
            signal?.addEventListener('abort', () =>
              resolve({ hasMore: false, messages: [], nextCursor: null }),
            );
          });
        },
      ),
    });
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    act(() => {
      result.current.prefetchThread('thread-a');
      vi.advanceTimersByTime(150);
    });

    act(() => {
      useAgentChatStore.getState().setActiveThread('thread-a');
      result.current.cancelPrefetch('thread-a');
    });

    expect(capturedSignal?.aborted).toBe(false);
    expect(conversationHydrationFlights.has('thread-a')).toBe(true);
  });

  it('registers the prefetch on the shared hydration flight so a click can adopt it', async () => {
    const apiService = makeApiService({
      getMessagesPage: vi.fn(
        (_threadId: string, _params, signal?: AbortSignal) =>
          new Promise<ReturnType<typeof makeMessagesPage>>((resolve) => {
            signal?.addEventListener('abort', () =>
              resolve({ hasMore: false, messages: [], nextCursor: null }),
            );
          }),
      ),
    });
    const { result } = renderHook(() => useAgentThreadPrefetch({ apiService }));

    act(() => {
      result.current.prefetchThread('thread-a');
      vi.advanceTimersByTime(150);
    });

    expect(conversationHydrationFlights.has('thread-a')).toBe(true);
  });

  it('cancels the pending/in-flight prefetch on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    const apiService = makeApiService({
      getMessagesPage: vi.fn(
        (_threadId: string, _params, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise<ReturnType<typeof makeMessagesPage>>((resolve) => {
            signal?.addEventListener('abort', () =>
              resolve({ hasMore: false, messages: [], nextCursor: null }),
            );
          });
        },
      ),
    });
    const { result, unmount } = renderHook(() =>
      useAgentThreadPrefetch({ apiService }),
    );

    act(() => {
      result.current.prefetchThread('thread-a');
      vi.advanceTimersByTime(150);
    });

    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
