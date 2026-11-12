import type {
  AgentChatMessage,
  AgentThreadSnapshot,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SHARED_THREAD_SYNC_DEBOUNCE_MS,
  useAgentSharedThreadSync,
} from './use-agent-shared-thread-sync';

const socket = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
  subscribe: vi.fn(),
}));
const runtime = vi.hoisted(() => ({ findAgentStreamEntry: vi.fn() }));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({ isReady: true, subscribe: socket.subscribe }),
}));
vi.mock('./agent-chat-stream.runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./agent-chat-stream.runtime')>()),
  findAgentStreamEntry: runtime.findAgentStreamEntry,
}));

const snapshot = {
  activeRun: null,
  lastAssistantMessage: null,
  lastSequence: 4,
  latestProposedPlan: null,
  latestUiBlocks: null,
  memorySummaryRefs: [],
  pendingApprovals: [],
  pendingInputRequests: [],
  profileSnapshot: null,
  sessionBinding: null,
  source: null,
  threadId: 'thread-1',
  threadStatus: null,
  timeline: [],
  title: null,
} as unknown as AgentThreadSnapshot;

const teammateReply = {
  content: 'Drafted three hooks for the launch post.',
  id: 'message-2',
  role: 'assistant',
} as AgentChatMessage;

describe('useAgentSharedThreadSync', () => {
  let apiService: AgentApiService;

  const emit = (type: string, threadId: string) =>
    act(() => {
      socket.handlers.get(type)?.({ threadId });
    });
  const settle = () =>
    act(() => vi.advanceTimersByTimeAsync(SHARED_THREAD_SYNC_DEBOUNCE_MS + 1));

  beforeEach(() => {
    vi.useFakeTimers();
    socket.handlers.clear();
    socket.subscribe
      .mockReset()
      .mockImplementation(
        (type: string, handler: (payload: unknown) => void) => {
          socket.handlers.set(type, handler);
          return () => socket.handlers.delete(type);
        },
      );
    runtime.findAgentStreamEntry.mockReset().mockReturnValue(undefined);
    apiService = {
      getMessages: vi.fn().mockResolvedValue([teammateReply]),
      getThreadSnapshot: vi.fn().mockResolvedValue(snapshot),
    } as unknown as AgentApiService;
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.getState().setActiveThread('thread-1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a teammate's reply in the open thread when their run finishes", async () => {
    renderHook(() => useAgentSharedThreadSync(apiService));

    emit('agent:done', 'thread-1');
    await settle();

    expect(useAgentChatStore.getState().messages).toEqual([teammateReply]);
  });

  it('reloads a burst of events from one run once', async () => {
    renderHook(() => useAgentSharedThreadSync(apiService));

    emit('agent:stream_start', 'thread-1');
    emit('agent:tool_complete', 'thread-1');
    emit('agent:done', 'thread-1');
    await settle();

    expect(apiService.getThreadSnapshot).toHaveBeenCalledTimes(1);
  });

  it('ignores events for a thread that is not open', async () => {
    renderHook(() => useAgentSharedThreadSync(apiService));

    emit('agent:done', 'thread-2');
    await settle();

    expect(useAgentChatStore.getState().messages).toEqual([]);
  });

  it('leaves a thread whose stream this client owns to that stream', async () => {
    runtime.findAgentStreamEntry.mockReturnValue({ terminalAt: null });
    renderHook(() => useAgentSharedThreadSync(apiService));

    emit('agent:done', 'thread-1');
    await settle();

    expect(useAgentChatStore.getState().messages).toEqual([]);
  });

  it('stops listening on unmount', () => {
    const { unmount } = renderHook(() => useAgentSharedThreadSync(apiService));
    expect(socket.handlers.size).toBeGreaterThan(0);

    unmount();

    expect(socket.handlers.size).toBe(0);
  });
});
