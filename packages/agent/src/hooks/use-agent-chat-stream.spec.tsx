'use client';

import { useAgentThreadList } from '@genfeedai/agent/components/useAgentThreadList';
import {
  getAgentStreamRuntime,
  resetAgentStreamRuntime,
} from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import { useAgentChatStream } from '@genfeedai/agent/hooks/use-agent-chat-stream';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/enums';
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
  getThreads: 'getThreadsEffect',
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

function createCircularIcon(): unknown {
  const icon: Record<string, unknown> = {};
  icon.Provider = icon;
  return icon;
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
    resetAgentStreamRuntime();
    useAgentChatStore.setState({
      activeRunId: null,
      activeRunStatus: 'idle',
      activeThreadId: null,
      error: null,
      isGenerating: false,
      messages: [],
      pendingInputRequest: null,
      pageContext: null,
      runStartedAt: null,
      stream: {
        activeToolCalls: [],
        isStreaming: false,
        pendingUiActions: [],
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

  it('mounts without triggering a callback initialization error', () => {
    const apiService = createApiService({});

    expect(() =>
      renderHook(() =>
        useAgentChatStream({
          apiService,
        }),
      ),
    ).not.toThrow();
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
          brandId: null,
          contextVersion: 1,
          executionId: 'run-1',
          queuedAt: startedAt,
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
    // Tokens land on the next animation frame, not on the emitting tick —
    // `appendStreamToken` buffers and schedules a single coalesced flush.
    await waitFor(() =>
      expect(useAgentChatStore.getState().stream.streamingContent).toBe(
        'Hello world',
      ),
    );
    expect(state.threads[0]).toEqual(
      expect.objectContaining({
        brandId: null,
        contextVersion: 1,
        id: 'thread-new',
        title: 'Start a new run',
      }),
    );
  });

  it('retries an ambiguous acknowledgement once with the same client request identity', async () => {
    const acceptedAt = '2026-08-26T08:00:00.000Z';
    const chatStream = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('Network request failed'), { status: 0 }),
      )
      .mockResolvedValue({
        clientRequestId: 'server-echo',
        contextId: 'thread-recovered:v1',
        contextVersion: 1,
        queuedAt: acceptedAt,
        executionId: 'run-recovered',
        status: 'queued',
        threadId: 'thread-recovered',
      });
    const apiService = createApiService({ chatStream });

    const { result } = renderHook(() => useAgentChatStream({ apiService }));

    await act(async () => {
      await result.current.sendMessage('Recover this acknowledgement');
    });

    expect(chatStream).toHaveBeenCalledTimes(2);
    const firstRequest = chatStream.mock.calls[0]?.[0];
    const retryRequest = chatStream.mock.calls[1]?.[0];
    expect(firstRequest.clientRequestId).toEqual(expect.any(String));
    expect(retryRequest.clientRequestId).toBe(firstRequest.clientRequestId);
    expect(useAgentChatStore.getState()).toEqual(
      expect.objectContaining({
        activeRunId: 'run-recovered',
        activeRunStatus: 'running',
        activeThreadId: 'thread-recovered',
        runStartedAt: acceptedAt,
      }),
    );
  });

  it('writes the send title into the store immediately without a refresh event', async () => {
    const refreshListener = vi.fn();
    window.addEventListener('agent:threads:refresh', refreshListener);

    useAgentChatStore.setState({
      threads: [
        {
          contextVersion: 1,
          createdAt: '2026-03-09T08:00:00.000Z',
          id: 'recent-other',
          status: AgentThreadStatus.ACTIVE,
          title: 'Already recent',
          updatedAt: '2026-03-09T12:00:00.000Z',
        },
      ],
    });

    const apiService = createApiService({
      chatStream: vi.fn().mockResolvedValue({
        brandId: null,
        contextVersion: 1,
        executionId: 'run-send',
        queuedAt: '2026-03-09T13:00:00.000Z',
        threadId: 'thread-send',
      }),
    });

    const { result } = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Visible sidebar title from send');
    });

    const threads = useAgentChatStore.getState().threads;
    expect(threads[0]?.id).toBe('thread-send');
    expect(threads[0]?.title).toBe('Visible sidebar title from send');
    expect(refreshListener).not.toHaveBeenCalled();

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(refreshListener).not.toHaveBeenCalled();
    window.removeEventListener('agent:threads:refresh', refreshListener);
  });

  it('reorders the list from finalize without a guessed refresh timeout', async () => {
    const refreshListener = vi.fn();
    window.addEventListener('agent:threads:refresh', refreshListener);

    const startedAt = '2026-03-09T10:00:00.000Z';
    const apiService = createApiService({
      chatStream: vi.fn().mockResolvedValue({
        brandId: null,
        contextVersion: 1,
        executionId: 'run-finalize',
        queuedAt: startedAt,
        threadId: 'thread-finalize',
      }),
    });

    useAgentChatStore.setState({
      threads: [
        {
          contextVersion: 1,
          createdAt: startedAt,
          id: 'thread-other',
          status: AgentThreadStatus.ACTIVE,
          title: 'Other',
          updatedAt: '2026-03-09T12:00:00.000Z',
        },
        {
          contextVersion: 1,
          createdAt: startedAt,
          id: 'thread-finalize',
          status: AgentThreadStatus.ACTIVE,
          title: 'Finalize me',
          updatedAt: startedAt,
        },
      ],
    });
    useAgentChatStore.getState().setActiveThread('thread-finalize');

    const { result } = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Finalize me');
    });

    act(() => {
      const finalizedThread = useAgentChatStore
        .getState()
        .threads.find((thread) => thread.id === 'thread-finalize');

      useAgentChatStore.setState({
        threads: [
          {
            contextVersion: 1,
            createdAt: startedAt,
            id: 'thread-other',
            status: AgentThreadStatus.ACTIVE,
            title: 'Other',
            updatedAt: '2026-03-09T14:00:00.000Z',
          },
          {
            contextVersion: 1,
            createdAt: startedAt,
            id: 'thread-finalize',
            runStatus: finalizedThread?.runStatus,
            status: AgentThreadStatus.ACTIVE,
            title: finalizedThread?.title ?? 'Finalize me',
            updatedAt: startedAt,
          },
        ],
      });
    });

    await act(async () => {
      for (const handler of socketHandlers.get('agent:done') ?? []) {
        handler({
          creditsRemaining: 88,
          fullContent: 'Final answer',
          metadata: {},
          runId: 'run-finalize',
          startedAt,
          threadId: 'thread-finalize',
          toolCalls: [],
        });
      }
    });

    const threads = useAgentChatStore.getState().threads;
    expect(threads[0]?.id).toBe('thread-finalize');
    expect(threads[0]?.runStatus).toBe('completed');
    expect(refreshListener).not.toHaveBeenCalled();

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(refreshListener).not.toHaveBeenCalled();
    window.removeEventListener('agent:threads:refresh', refreshListener);
  });

  it('does not adopt a stream owned by a different thread', () => {
    const streamRuntime = getAgentStreamRuntime();
    const ownedUnsub = vi.fn();
    streamRuntime.activeStreamThreadRef.current = 'thread-a';
    streamRuntime.unsubscribersRef.current = [ownedUnsub];
    streamRuntime.pendingCompletionRef.current = {
      initiatedAt: 1,
      preAssistantIds: new Set(),
      runId: 'run-a',
      startedAt: '2026-08-16T10:00:00.000Z',
      threadId: 'thread-a',
    };

    useAgentChatStore.setState({
      activeRunId: 'run-a',
      activeThreadId: 'thread-b',
      runStartedAt: '2026-08-16T10:00:00.000Z',
      stream: {
        activeToolCalls: [],
        isStreaming: true,
        pendingUiActions: [],
        streamingContent: 'partial from A',
        streamingReasoning: '',
      },
    });

    renderHook(() =>
      useAgentChatStream({
        apiService: createApiService({}),
      }),
    );

    expect(streamRuntime.activeStreamThreadRef.current).toBe('thread-a');
    expect(streamRuntime.pendingCompletionRef.current?.threadId).toBe(
      'thread-a',
    );
    expect(streamRuntime.unsubscribersRef.current).toEqual([ownedUnsub]);
    expect(socketHandlers.size).toBe(0);
  });

  it('adopts a live stream when no thread owns it yet', () => {
    const streamRuntime = getAgentStreamRuntime();

    useAgentChatStore.setState({
      activeRunId: 'run-orphan',
      activeThreadId: 'thread-orphan',
      runStartedAt: '2026-08-16T10:00:00.000Z',
      stream: {
        activeToolCalls: [],
        isStreaming: true,
        pendingUiActions: [],
        streamingContent: '',
        streamingReasoning: '',
      },
    });

    renderHook(() =>
      useAgentChatStream({
        apiService: createApiService({}),
      }),
    );

    expect(streamRuntime.activeStreamThreadRef.current).toBe('thread-orphan');
    expect(streamRuntime.pendingCompletionRef.current?.threadId).toBe(
      'thread-orphan',
    );
    expect(streamRuntime.unsubscribersRef.current.length).toBeGreaterThan(0);
  });

  it('keeps one stream owner when the hook is mounted twice (layout + page)', async () => {
    // The persistent agent layout and the per-route chat container each mount
    // this hook. Sending from one instance used to make the other "adopt" the
    // in-flight run, so both handled `agent:token` and `agent:done` and the
    // first reply rendered twice.
    const startedAt = '2026-08-16T10:00:00.000Z';
    const apiService = createApiService({
      chatStream: vi.fn().mockResolvedValue({
        brandId: null,
        contextVersion: 1,
        executionId: 'run-shared',
        queuedAt: startedAt,
        threadId: 'thread-shared',
      }),
    });

    const layoutInstance = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );
    const pageInstance = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    await act(async () => {
      await pageInstance.result.current.sendMessage('First prompt');
    });

    layoutInstance.rerender();
    pageInstance.rerender();

    await act(async () => {
      for (const handler of socketHandlers.get('agent:token') ?? []) {
        handler({ threadId: 'thread-shared', token: 'Hello' });
      }
    });

    await waitFor(() =>
      expect(useAgentChatStore.getState().stream.streamingContent).toBe(
        'Hello',
      ),
    );

    await act(async () => {
      for (const handler of socketHandlers.get('agent:done') ?? []) {
        handler({
          creditsRemaining: 10,
          fullContent: 'Hello',
          metadata: {},
          runId: 'run-shared',
          startedAt,
          threadId: 'thread-shared',
          toolCalls: [],
        });
      }
    });

    const assistantMessages = useAgentChatStore
      .getState()
      .messages.filter((message) => message.role === 'assistant');

    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.content).toBe('Hello');
    expect(useAgentChatStore.getState().stream.isStreaming).toBe(false);
  });

  it('keeps the shared subscriptions alive while another instance is still mounted', async () => {
    // Route-segment swap on the first send: the page container unmounts and a
    // new one mounts while the layout instance stays up. Tearing the shared
    // listeners down with the departing instance would strand the run.
    const startedAt = '2026-08-16T10:00:00.000Z';
    const apiService = createApiService({
      chatStream: vi.fn().mockResolvedValue({
        brandId: null,
        contextVersion: 1,
        executionId: 'run-swap',
        queuedAt: startedAt,
        threadId: 'thread-swap',
      }),
    });

    renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );
    const firstPage = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    await act(async () => {
      await firstPage.result.current.sendMessage('First prompt');
    });

    firstPage.unmount();

    const secondPage = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );
    secondPage.rerender();

    await act(async () => {
      for (const handler of socketHandlers.get('agent:done') ?? []) {
        handler({
          creditsRemaining: 10,
          fullContent: 'Recovered after swap',
          metadata: {},
          runId: 'run-swap',
          startedAt,
          threadId: 'thread-swap',
          toolCalls: [],
        });
      }
    });

    const assistantMessages = useAgentChatStore
      .getState()
      .messages.filter((message) => message.role === 'assistant');

    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.content).toBe('Recovered after swap');
    expect(useAgentChatStore.getState().stream.isStreaming).toBe(false);
  });

  it('sends selected canonical artifact references with a streaming turn', async () => {
    const chatStream = vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      contextVersion: 1,
      executionId: 'run-reference',
      queuedAt: '2026-07-13T00:00:00.000Z',
      threadId: 'thread-reference',
    });
    const apiService = createApiService({ chatStream });
    const reference = {
      brandId: 'brand-1',
      kind: 'post' as const,
      organizationId: 'org-1',
      recordId: 'post-1',
      serializer: 'post' as const,
    };
    const { result } = renderHook(() => useAgentChatStream({ apiService }));

    await act(async () => {
      await result.current.sendMessage('Review this post', {
        artifactReferences: [reference],
      });
    });

    expect(chatStream).toHaveBeenCalledWith(
      expect.objectContaining({ artifactReferences: [reference] }),
      expect.any(AbortSignal),
    );
  });

  it('durably accepts the turn when the socket is not ready', async () => {
    socketReady = false;
    socketConnected = false;

    const queuedAt = '2026-08-26T09:00:00.000Z';
    const apiService = createApiService({
      chat: vi.fn(),
      chatStream: vi.fn().mockResolvedValue({
        brandId: null,
        clientRequestId: 'request-offline-socket',
        contextId: 'context-offline-socket',
        contextVersion: 1,
        queuedAt,
        executionId: 'run-offline-socket',
        status: 'queued',
        threadId: 'thread-fallback',
      }),
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

    expect(apiService.chat).not.toHaveBeenCalled();
    expect(apiService.chatStream).toHaveBeenCalledTimes(1);
    expect(apiService.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Show me the analytics',
        model: undefined,
      }),
      expect.any(AbortSignal),
    );
    expect(state.activeThreadId).toBe('thread-fallback');
    expect(state.activeRunId).toBe('run-offline-socket');
    expect(state.stream.isStreaming).toBe(true);
    expect(state.threads[0]).toEqual(
      expect.objectContaining({
        brandId: null,
        contextVersion: 1,
        id: 'thread-fallback',
      }),
    );
  });

  it('leaves the model unset for streaming sends so the server resolves the runtime default', async () => {
    const startedAt = '2026-03-09T10:00:00.000Z';
    const apiService = createApiService({
      chatStream: vi.fn().mockResolvedValue({
        executionId: 'run-kimi-default',
        queuedAt: startedAt,
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
        model: undefined,
      }),
      expect.any(AbortSignal),
    );
  });

  it('strips UI-only page context before streaming chat payloads', async () => {
    useAgentChatStore.setState({
      pageContext: {
        placeholder: 'Ask me anything...',
        route: '/default/~/agent',
        selectedText: 'selected copy',
        suggestedActions: [
          {
            icon: createCircularIcon() as never,
            label: 'Generate',
            prompt: 'Generate a post',
          },
        ],
      },
    });

    const startedAt = '2026-03-09T10:00:00.000Z';
    const chatStream = vi.fn().mockResolvedValue({
      executionId: 'run-plain-context',
      queuedAt: startedAt,
      threadId: 'thread-plain-context',
    });
    const apiService = createApiService({
      chatStream,
    });

    const { result } = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Use current page context');
    });

    expect(chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        pageContext: {
          route: '/default/~/agent',
          selectedText: 'selected copy',
        },
      }),
      expect.any(AbortSignal),
    );

    const [payload] = chatStream.mock.calls[0] ?? [];

    expect(payload?.pageContext).not.toHaveProperty('placeholder');
    expect(payload?.pageContext).not.toHaveProperty('suggestedActions');
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it('sends composer media settings as structured workflow input', async () => {
    const chatStream = vi.fn().mockResolvedValue({
      executionId: 'run-image-settings',
      queuedAt: '2026-03-09T10:00:00.000Z',
      threadId: 'thread-image-settings',
    });
    const apiService = createApiService({ chatStream });
    const { result } = renderHook(() => useAgentChatStream({ apiService }));

    await act(async () => {
      await result.current.sendMessage('Create a portrait campaign visual', {
        generationMode: 'image',
        generationSettings: {
          aspectRatio: '4:5',
          model: 'replicate/image-model',
          outputs: 2,
        },
      });
    });

    expect(chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        generationMode: 'image',
        generationSettings: {
          aspectRatio: '4:5',
          model: 'replicate/image-model',
          outputs: 2,
        },
      }),
      expect.any(AbortSignal),
    );

    const [payload] = chatStream.mock.calls[0] ?? [];
    expect(payload?.pageContext?.draftInstructions).toBeUndefined();
  });

  it('preserves an explicit model override for streaming sends', async () => {
    const startedAt = '2026-03-09T10:00:00.000Z';
    const apiService = createApiService({
      chatStream: vi.fn().mockResolvedValue({
        executionId: 'run-model-override',
        queuedAt: startedAt,
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
        executionId: 'run-2',
        queuedAt: startedAt,
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
        executionId: 'run-3',
        queuedAt: startedAt,
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
        executionId: 'run-background',
        queuedAt: startedAt,
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

  it('does not rehydrate or refresh threads on the initial socket connect', async () => {
    // Every mount of useSocketManager reports 'connecting' before the shared
    // manager answers 'connected'. Treating that as a reconnect re-fetched the
    // snapshot and refreshed the sidebar on every route change.
    socketConnectionState = 'connecting';
    socketConnected = false;

    useAgentChatStore.setState({
      activeThreadId: 'thread-initial',
      messages: [],
    });

    const getThreads = vi.fn().mockResolvedValue([]);
    const apiService = createApiService({
      getMessages: vi.fn().mockResolvedValue([]),
      getThreadSnapshot: vi.fn().mockResolvedValue(null),
      getThreads,
    });
    const refreshListener = vi.fn();
    window.addEventListener('agent:threads:refresh', refreshListener);

    const { rerender } = renderHook(() =>
      useAgentChatStream({
        apiService,
      }),
    );

    socketConnectionState = 'connected';
    socketConnected = true;
    rerender();

    await act(async () => {
      await Promise.resolve();
    });

    expect(apiService.getThreadSnapshot).not.toHaveBeenCalled();
    expect(getThreads).not.toHaveBeenCalled();
    expect(refreshListener).not.toHaveBeenCalled();
    window.removeEventListener('agent:threads:refresh', refreshListener);
  });

  it('rehydrates the visible thread from snapshot after reconnect', async () => {
    socketConnectionState = 'reconnecting';
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

  it('rehydrates after reconnect when stream has no pendingUiActions field', async () => {
    socketConnectionState = 'reconnecting';
    socketConnected = false;

    useAgentChatStore.setState({
      activeRunId: 'run-legacy-stream',
      activeRunStatus: 'running',
      activeThreadId: 'thread-legacy-stream',
      messages: [],
      stream: {
        activeToolCalls: [],
        isStreaming: false,
        streamingContent: '',
        streamingReasoning: '',
      },
      threads: [
        {
          createdAt: '2026-03-09T10:00:00.000Z',
          id: 'thread-legacy-stream',
          runStatus: 'running',
          status: 'active' as never,
          title: 'Legacy stream',
          updatedAt: '2026-03-09T10:00:00.000Z',
        },
      ],
      workEvents: [],
    });

    const apiService = createApiService({
      getMessages: vi.fn().mockResolvedValue([
        {
          content: 'Recovered legacy stream',
          createdAt: '2026-03-09T10:00:08.000Z',
          id: 'assistant-legacy',
          role: 'assistant',
          threadId: 'thread-legacy-stream',
        },
      ]),
      getThreadSnapshot: vi.fn().mockResolvedValue({
        activeRun: null,
        lastAssistantMessage: {
          content: 'Recovered legacy stream',
          createdAt: '2026-03-09T10:00:08.000Z',
          messageId: 'assistant-legacy',
        },
        lastSequence: 1,
        latestProposedPlan: null,
        latestUiBlocks: null,
        memorySummaryRefs: [],
        pendingApprovals: [],
        pendingInputRequests: [],
        profileSnapshot: null,
        sessionBinding: null,
        source: 'agent',
        threadId: 'thread-legacy-stream',
        threadStatus: 'active',
        timeline: [],
        title: 'Legacy stream',
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
        'thread-legacy-stream',
      );
    });
  });

  it('does not restore a snapshot over a live local stream on reconnect', async () => {
    socketConnectionState = 'reconnecting';
    socketConnected = false;

    const startedAt = '2026-08-17T10:00:00.000Z';
    const liveMessages = [
      {
        content: 'Generate a cover',
        createdAt: startedAt,
        id: 'user-live',
        role: 'user' as const,
        threadId: 'thread-live',
      },
    ];
    const liveWorkEvents = [
      {
        createdAt: startedAt,
        event: 'tool_started' as const,
        id: 'work-live',
        label: 'Generating image',
        runId: 'run-live',
        status: 'running' as const,
        threadId: 'thread-live',
      },
    ];
    const liveGenerationCard = {
      id: 'generation-live',
      title: 'Generate image',
      type: 'generation_action_card' as const,
    };

    useAgentChatStore.setState({
      activeRunId: 'run-live',
      activeRunStatus: 'running',
      activeThreadId: 'thread-live',
      messages: liveMessages,
      stream: {
        activeToolCalls: [],
        isStreaming: true,
        pendingUiActions: [liveGenerationCard],
        streamingContent: 'Working on the cover',
        streamingReasoning: '',
      },
      threads: [
        {
          createdAt: startedAt,
          id: 'thread-live',
          runStatus: 'running',
          status: 'active' as never,
          title: 'Live generate',
          updatedAt: startedAt,
        },
      ],
      workEvents: liveWorkEvents,
    });

    const apiService = createApiService({
      getMessages: vi.fn().mockResolvedValue([]),
      getThreadSnapshot: vi.fn().mockResolvedValue({
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
        threadId: 'thread-live',
        threadStatus: 'active',
        timeline: [],
        title: 'Stale snapshot',
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

    await act(async () => {
      await Promise.resolve();
    });

    expect(apiService.getThreadSnapshot).not.toHaveBeenCalled();
    expect(apiService.getMessages).not.toHaveBeenCalled();

    const state = useAgentChatStore.getState();

    expect(state.messages).toEqual(liveMessages);
    expect(state.workEvents).toEqual(liveWorkEvents);
    expect(state.stream.isStreaming).toBe(true);
    expect(state.stream.streamingContent).toBe('Working on the cover');
    expect(state.stream.pendingUiActions).toEqual([liveGenerationCard]);
    expect(state.activeRunId).toBe('run-live');
    expect(state.activeRunStatus).toBe('running');
  });

  it('does not refetch the thread list when the socket reconnects', async () => {
    socketConnectionState = 'reconnecting';
    socketConnected = false;

    useAgentChatStore.setState({
      activeThreadId: 'thread-reconnect',
      threads: [
        {
          contextVersion: 1,
          createdAt: '2026-03-09T10:00:00.000Z',
          id: 'thread-reconnect',
          status: AgentThreadStatus.ACTIVE,
          title: 'Reconnect thread',
          updatedAt: '2026-03-09T10:00:00.000Z',
        },
      ],
    });

    const getThreads = vi.fn().mockResolvedValue([
      {
        contextVersion: 1,
        createdAt: '2026-03-09T10:00:00.000Z',
        id: 'thread-reconnect',
        status: AgentThreadStatus.ACTIVE,
        title: 'Reconnect thread',
        updatedAt: '2026-03-09T10:00:00.000Z',
      },
    ]);
    const refreshListener = vi.fn();
    window.addEventListener('agent:threads:refresh', refreshListener);

    const apiService = createApiService({
      getThreadSnapshot: vi.fn().mockResolvedValue({
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
        threadId: 'thread-reconnect',
        threadStatus: 'active',
        timeline: [],
        title: 'Reconnect thread',
      }),
      getThreads,
    });

    const { rerender } = renderHook(() => {
      const list = useAgentThreadList({
        apiService,
        isActive: true,
      });
      const stream = useAgentChatStream({
        apiService,
      });
      return { list, stream };
    });

    await waitFor(() => {
      expect(getThreads).toHaveBeenCalledTimes(1);
    });

    socketConnectionState = 'connected';
    socketConnected = true;
    rerender();

    await act(async () => {
      await Promise.resolve();
    });
    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 200);
        }),
    );

    expect(getThreads).toHaveBeenCalledTimes(1);
    expect(refreshListener).not.toHaveBeenCalled();
    window.removeEventListener('agent:threads:refresh', refreshListener);
  });
});
