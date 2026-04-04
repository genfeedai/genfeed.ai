'use client';

import { DEFAULT_RUNTIME_AGENT_MODEL } from '@cloud/agent/constants/agent-runtime-model.constant';
import { useAgentChatStream } from '@cloud/agent/hooks/use-agent-chat-stream';
import type { AgentApiService } from '@cloud/agent/services/agent-api.service';
import { useAgentChatStore } from '@cloud/agent/stores/agent-chat.store';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SocketHandler = (data: unknown) => void;

const socketHandlers = new Map<string, SocketHandler[]>();
let socketReady = true;
let socketConnected = true;
let socketConnectionState:
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline' = 'connected';

const EFFECT_METHOD_MAP = {
  chat: 'chatEffect',
  chatStream: 'chatStreamEffect',
  getMessages: 'getMessagesEffect',
  getThreadSnapshot: 'getThreadSnapshotEffect',
} as const;

function withAgentApiEffects<T extends Record<string, unknown>>(
  apiService: T,
): T {
  for (const [method, effectMethod] of Object.entries(EFFECT_METHOD_MAP)) {
    const handler = apiService[method as keyof T];

    if (typeof handler !== 'function' || effectMethod in apiService) {
      continue;
    }

    Object.assign(apiService, {
      [effectMethod]: vi.fn((...args: unknown[]) =>
        Effect.promise(() =>
          Promise.resolve(
            (handler as (...effectArgs: unknown[]) => unknown)(...args),
          ),
        ),
      ),
    });
  }

  return apiService;
}

function createApiService(overrides: Record<string, unknown>): AgentApiService {
  return withAgentApiEffects(overrides) as unknown as AgentApiService;
}

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    connectionState: socketConnectionState,
    getSocketManager: () => ({
      isConnected: () => socketConnected,
    }),
    isReady: socketReady,
    subscribe: (event: string, handler: SocketHandler) => {
      const handlers = socketHandlers.get(event) ?? [];
      handlers.push(handler);
      socketHandlers.set(event, handlers);

      return () => {
        socketHandlers.set(
          event,
          (socketHandlers.get(event) ?? []).filter((item) => item !== handler),
        );
      };
    },
  }),
}));

vi.mock('../utils/apply-dashboard-operation', () => ({
  applyDashboardOperation: vi.fn(),
}));

describe('useAgentChatStream', () => {
  beforeEach(() => {
    socketReady = true;
    socketConnected = true;
    socketConnectionState = 'connected';
    socketHandlers.clear();
    useAgentChatStore.setState({
      activeRunId: null,
      activeRunStatus: 'idle',
      activeThreadId: null,
      error: null,
      isGenerating: false,
      messages: [],
      pendingInputRequest: null,
      runStartedAt: null,
      stream: {
        activeToolCalls: [],
        isStreaming: false,
        streamingContent: '',
        streamingReasoning: '',
      },
      threads: [],
      workEvents: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buffers early socket events until the stream response provides the thread id', async () => {
    const startedAt = '2026-03-09T10:00:00.000Z';
    const apiService = createApiService({
      chatStream: vi.fn(async () => {
        for (const handler of socketHandlers.get('agent:stream_start') ?? []) {
          handler({
            runId: 'run-1',
            startedAt,
            threadId: 'thread-new',
          });
        }

        for (const handler of socketHandlers.get('agent:token') ?? []) {
          handler({
            threadId: 'thread-new',
            token: 'Hello world',
          });
        }

        return {
          runId: 'run-1',
          startedAt,
          threadId: 'thread-new',
        };
      }),
    });

    const { result } = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Start a new run');
    });

    const state = useAgentChatStore.getState();

    expect(apiService.chatStream).toHaveBeenCalledTimes(1);
    expect(state.activeThreadId).toBe('thread-new');
    expect(state.activeRunId).toBe('run-1');
    expect(state.runStartedAt).toBe(startedAt);
    expect(state.stream.streamingContent).toBe('Hello world');
  });

  it('falls back to non-streaming chat when the socket is not ready', async () => {
    socketReady = false;
    socketConnected = false;

    const apiService = createApiService({
      chat: vi.fn().mockResolvedValue({
        creditsRemaining: 96,
        creditsUsed: 4,
        message: {
          content: 'Here are your analytics.',
          metadata: {},
          role: 'assistant',
        },
        threadId: 'thread-fallback',
        toolCalls: [],
      }),
      chatStream: vi.fn(),
    });

    const { result } = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Show me the analytics');
    });

    const state = useAgentChatStore.getState();

    expect(apiService.chatStream).not.toHaveBeenCalled();
    expect(apiService.chat).toHaveBeenCalledTimes(1);
    expect(apiService.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Show me the analytics',
        model: DEFAULT_RUNTIME_AGENT_MODEL,
      }),
      undefined,
    );
    expect(state.activeThreadId).toBe('thread-fallback');
    expect(state.messages.at(-1)?.content).toBe('Here are your analytics.');
    expect(state.stream.isStreaming).toBe(false);
  });

  it('uses the runtime default model for streaming sends when no override is supplied', async () => {
    const startedAt = '2026-03-09T10:00:00.000Z';
    const apiService = createApiService({
      chatStream: vi.fn().mockResolvedValue({
        runId: 'run-kimi-default',
        startedAt,
        threadId: 'thread-kimi-default',
      }),
    });

    const { result } = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Start with Kimi');
    });

    expect(apiService.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Start with Kimi',
        model: DEFAULT_RUNTIME_AGENT_MODEL,
      }),
      expect.any(AbortSignal),
    );
  });

  it('preserves an explicit model override for streaming sends', async () => {
    const startedAt = '2026-03-09T10:00:00.000Z';
    const apiService = createApiService({
      chatStream: vi.fn().mockResolvedValue({
        runId: 'run-model-override',
        startedAt,
        threadId: 'thread-model-override',
      }),
    });

    const { result } = renderHook(() =>
      useAgentChatStream({
        apiService,
        model: 'openai/gpt-5.4',
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Start with explicit model');
    });

    expect(apiService.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Start with explicit model',
        model: 'openai/gpt-5.4',
      }),
      expect.any(AbortSignal),
    );
  });

  it('recovers the final assistant message from thread history when the done event is missed', async () => {
    vi.useFakeTimers();

    const startedAt = '2026-03-09T10:00:00.000Z';
    const apiService = createApiService({
      chatStream: vi.fn().mockResolvedValue({
        runId: 'run-2',
        startedAt,
        threadId: 'thread-recover',
      }),
      getMessages: vi.fn().mockResolvedValue([
        {
          content: 'Show me the analytics',
          createdAt: startedAt,
          id: 'server-user-1',
          role: 'user',
          threadId: 'thread-recover',
        },
        {
          content: 'Recovered analytics summary',
          createdAt: '2026-03-09T10:00:10.000Z',
          id: 'server-assistant-1',
          role: 'assistant',
          threadId: 'thread-recover',
        },
      ]),
    });

    const { result } = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Show me the analytics');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    const state = useAgentChatStore.getState();

    expect(apiService.getMessages).toHaveBeenCalledWith('thread-recover', {
      limit: 100,
    });
    expect(state.messages.at(-1)?.content).toBe('Recovered analytics summary');
    expect(state.activeRunStatus).toBe('completed');
    expect(state.stream.isStreaming).toBe(false);
    expect(state.error).toBeNull();
  });

  it('keeps long-running quiet streams alive before failing recovery', async () => {
    vi.useFakeTimers();

    const startedAt = '2026-03-09T10:00:00.000Z';
    const apiService = createApiService({
      chatStream: vi.fn().mockResolvedValue({
        runId: 'run-3',
        startedAt,
        threadId: 'thread-slow',
      }),
      getMessages: vi
        .fn()
        .mockResolvedValueOnce([
          {
            content: 'How did my content perform this week?',
            createdAt: startedAt,
            id: 'server-user-1',
            role: 'user',
            threadId: 'thread-slow',
          },
        ])
        .mockResolvedValueOnce([
          {
            content: 'How did my content perform this week?',
            createdAt: startedAt,
            id: 'server-user-1',
            role: 'user',
            threadId: 'thread-slow',
          },
          {
            content: 'Recovered after a longer run',
            createdAt: '2026-03-09T10:00:55.000Z',
            id: 'server-assistant-2',
            role: 'assistant',
            threadId: 'thread-slow',
          },
        ]),
    });

    const { result } = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('How did my content perform this week?');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    let state = useAgentChatStore.getState();

    expect(state.activeRunStatus).toBe('running');
    expect(state.error).toBeNull();
    expect(state.stream.isStreaming).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    state = useAgentChatStore.getState();

    expect(apiService.getMessages).toHaveBeenCalledTimes(2);
    expect(state.messages.at(-1)?.content).toBe('Recovered after a longer run');
    expect(state.activeRunStatus).toBe('completed');
    expect(state.error).toBeNull();
  });

  it('keeps a run alive in the background after switching to another thread', async () => {
    const startedAt = '2026-03-09T10:00:00.000Z';
    const apiService = createApiService({
      chatStream: vi.fn().mockResolvedValue({
        runId: 'run-background',
        startedAt,
        threadId: 'thread-a',
      }),
    });

    const { result } = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Start background thread');
    });

    useAgentChatStore.setState((state) => ({
      activeThreadId: 'thread-b',
      stream: {
        ...state.stream,
        streamingContent: '',
      },
      threads: [
        {
          createdAt: startedAt,
          id: 'thread-a',
          status: 'active' as never,
          title: 'Background thread',
          updatedAt: startedAt,
        },
        {
          createdAt: startedAt,
          id: 'thread-b',
          status: 'active' as never,
          title: 'Visible thread',
          updatedAt: startedAt,
        },
      ],
    }));

    await act(async () => {
      for (const handler of socketHandlers.get('agent:token') ?? []) {
        handler({
          threadId: 'thread-a',
          token: 'Hidden token',
        });
      }

      for (const handler of socketHandlers.get('agent:done') ?? []) {
        handler({
          creditsRemaining: 90,
          fullContent: 'Background completion',
          metadata: {},
          runId: 'run-background',
          startedAt,
          threadId: 'thread-a',
          toolCalls: [],
        });
      }
    });

    const state = useAgentChatStore.getState();
    const backgroundThread = state.threads.find(
      (thread) => thread.id === 'thread-a',
    );

    expect(state.activeThreadId).toBe('thread-b');
    expect(state.stream.streamingContent).toBe('');
    expect(backgroundThread?.lastAssistantPreview).toBe(
      'Background completion',
    );
    expect(backgroundThread?.attentionState).toBe('updated');
    expect(backgroundThread?.runStatus).toBe('completed');
  });

  it('rehydrates the visible thread from snapshot after reconnect', async () => {
    socketConnectionState = 'offline';
    socketConnected = false;

    useAgentChatStore.setState({
      activeRunId: 'run-reconnect',
      activeRunStatus: 'running',
      activeThreadId: 'thread-reconnect',
      messages: [],
      threads: [
        {
          createdAt: '2026-03-09T10:00:00.000Z',
          id: 'thread-reconnect',
          runStatus: 'running',
          status: 'active' as never,
          title: 'Reconnect thread',
          updatedAt: '2026-03-09T10:00:00.000Z',
        },
      ],
      workEvents: [],
    });

    const apiService = createApiService({
      getMessages: vi.fn().mockResolvedValue([
        {
          content: 'Reconnect prompt',
          createdAt: '2026-03-09T10:00:00.000Z',
          id: 'user-1',
          role: 'user',
          threadId: 'thread-reconnect',
        },
        {
          content: 'Recovered after reconnect',
          createdAt: '2026-03-09T10:00:08.000Z',
          id: 'assistant-1',
          role: 'assistant',
          threadId: 'thread-reconnect',
        },
      ]),
      getThreadSnapshot: vi.fn().mockResolvedValue({
        activeRun: null,
        lastAssistantMessage: {
          content: 'Recovered after reconnect',
          createdAt: '2026-03-09T10:00:08.000Z',
          messageId: 'assistant-1',
        },
        lastSequence: 2,
        latestProposedPlan: null,
        latestUiBlocks: null,
        memorySummaryRefs: [],
        pendingApprovals: [],
        pendingInputRequests: [],
        profileSnapshot: null,
        sessionBinding: null,
        source: 'agent',
        threadId: 'thread-reconnect',
        threadStatus: 'active',
        timeline: [],
        title: 'Reconnect thread',
      }),
    });

    const { rerender } = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    socketConnectionState = 'connected';
    socketConnected = true;

    rerender();

    await waitFor(() => {
      expect(apiService.getThreadSnapshot).toHaveBeenCalledWith(
        'thread-reconnect',
      );
    });

    const state = useAgentChatStore.getState();
    const thread = state.threads.find((item) => item.id === 'thread-reconnect');

    expect(state.messages.at(-1)?.content).toBe('Recovered after reconnect');
    expect(state.activeRunStatus).toBe('idle');
    expect(thread?.lastAssistantPreview).toBe('Recovered after reconnect');
    expect(thread?.runStatus).toBe('idle');
    expect(thread?.attentionState).toBeNull();
  });
});
