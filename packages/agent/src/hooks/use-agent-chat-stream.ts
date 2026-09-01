'use client';

import { resolveStreamFromMessages as resolveStreamFromMessagesFn } from '@genfeedai/agent/hooks/agent-chat-stream.completion';
import {
  collectAssistantMessageIds,
  flushBufferedEventsForThread,
} from '@genfeedai/agent/hooks/agent-chat-stream.helpers';
import { restoreThreadFromSnapshot as restoreThreadFromSnapshotFn } from '@genfeedai/agent/hooks/agent-chat-stream.restore';
import { getAgentStreamRuntime } from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import { attachAgentStreamSubscriptions } from '@genfeedai/agent/hooks/agent-chat-stream.subscriptions';
import type {
  PendingStreamCompletion,
  SendStreamMessageOptions,
  UseAgentChatStreamOptions,
  UseAgentChatStreamReturn,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { STREAM_COMPLETION_POLL_INTERVAL_MS } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type {
  AgentChatMessage,
  AgentChatStreamResponse,
  AgentThread,
} from '@genfeedai/agent/models/agent-chat.model';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { toAgentRequestPageContext } from '@genfeedai/agent/utils/agent-page-context.util';
import { serializeAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { hasLiveReconnectStream } from '@genfeedai/agent/utils/has-live-reconnect-stream';
import { syncAgentThreadFromTurn } from '@genfeedai/agent/utils/sync-agent-thread-from-turn';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useCallback, useEffect, useRef } from 'react';

export type {
  SendStreamMessageOptions,
  UseAgentChatStreamOptions,
  UseAgentChatStreamReturn,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';

// Stream ownership is shared across every mounted instance of this hook — see
// `getAgentStreamRuntime` for why a per-instance ref meant two stream owners.
const streamRuntime = getAgentStreamRuntime();

function createClientRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isAmbiguousAcknowledgementError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const status = (error as { status?: unknown }).status;
  return status === 0 || status === 408 || status === 504;
}

export function useAgentChatStream(
  options: UseAgentChatStreamOptions,
): UseAgentChatStreamReturn {
  const { apiService, model, onOnboardingCompleted } = options;
  const { connectionState, subscribe, isReady } = useSocketManager();

  const addMessage = useAgentChatStore((s) => s.addMessage);
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const setActiveThread = useAgentChatStore((s) => s.setActiveThread);
  const upsertThread = useAgentChatStore((s) => s.upsertThread);
  const setError = useAgentChatStore((s) => s.setError);
  const setMessages = useAgentChatStore((s) => s.setMessages);
  const setCreditsRemaining = useAgentChatStore((s) => s.setCreditsRemaining);
  const clearMessages = useAgentChatStore((s) => s.clearMessages);
  const isStreaming = useAgentChatStore((s) => s.stream.isStreaming);
  const addWorkEvent = useAgentChatStore((s) => s.addWorkEvent);
  const setActiveRun = useAgentChatStore((s) => s.setActiveRun);
  const setActiveRunStatus = useAgentChatStore((s) => s.setActiveRunStatus);
  const setWorkEvents = useAgentChatStore((s) => s.setWorkEvents);
  const setPendingInputRequest = useAgentChatStore(
    (s) => s.setPendingInputRequest,
  );
  const setLatestProposedPlan = useAgentChatStore(
    (s) => s.setLatestProposedPlan,
  );
  const clearPendingInputRequest = useAgentChatStore(
    (s) => s.clearPendingInputRequest,
  );
  const setRunStartedAt = useAgentChatStore((s) => s.setRunStartedAt);
  const setSocketConnectionState = useAgentChatStore(
    (s) => s.setSocketConnectionState,
  );
  const updateThread = useAgentChatStore((s) => s.updateThread);
  const pageContext = useAgentChatStore((s) => s.pageContext);

  const appendStreamToken = useAgentChatStore((s) => s.appendStreamToken);
  const setStreamingReasoning = useAgentChatStore(
    (s) => s.setStreamingReasoning,
  );
  const addActiveToolCall = useAgentChatStore((s) => s.addActiveToolCall);
  const addPendingUiActions = useAgentChatStore((s) => s.addPendingUiActions);
  const updateActiveToolCall = useAgentChatStore((s) => s.updateActiveToolCall);
  const finalizeStream = useAgentChatStore((s) => s.finalizeStream);
  const resetStreamState = useAgentChatStore((s) => s.resetStreamState);

  const abortRef = useRef<AbortController | null>(null);
  const resolveStreamFromMessagesRef = useRef<
    ((pending: PendingStreamCompletion) => Promise<void>) | null
  >(null);
  const previousConnectionStateRef = useRef(connectionState);

  const clearCompletionWatchdog = useCallback(() => {
    if (streamRuntime.completionTimeoutRef.current) {
      clearTimeout(streamRuntime.completionTimeoutRef.current);
      streamRuntime.completionTimeoutRef.current = null;
    }
  }, []);

  const cleanupSubscriptions = useCallback(() => {
    for (const unsub of streamRuntime.unsubscribersRef.current) {
      unsub();
    }
    streamRuntime.unsubscribersRef.current = [];
    streamRuntime.bufferedEventsRef.current = [];
  }, []);

  const flushBufferedEvents = useCallback((threadId: string) => {
    streamRuntime.bufferedEventsRef.current = flushBufferedEventsForThread(
      streamRuntime.bufferedEventsRef.current,
      threadId,
    );
  }, []);

  useEffect(() => {
    setSocketConnectionState(connectionState);
  }, [connectionState, setSocketConnectionState]);

  useEffect(() => {
    streamRuntime.mountCount += 1;

    return () => {
      streamRuntime.mountCount -= 1;

      // Another instance (the persistent layout, or the page container that
      // replaces this one on a route-segment swap) still owns the shared
      // subscriptions — only the last one out tears them down.
      if (streamRuntime.mountCount > 0) {
        return;
      }

      clearCompletionWatchdog();
      cleanupSubscriptions();
    };
  }, [cleanupSubscriptions, clearCompletionWatchdog]);

  const isThreadVisible = useCallback((threadId: string) => {
    return useAgentChatStore.getState().activeThreadId === threadId;
  }, []);

  const updateThreadSummary = useCallback(
    (threadId: string, patch: Partial<AgentThread>) => {
      const existingThread = useAgentChatStore
        .getState()
        .threads.find((thread) => thread.id === threadId);

      if (!existingThread) {
        return;
      }

      updateThread(threadId, patch);
    },
    [updateThread],
  );

  const markThreadRunning = useCallback(
    (
      threadId: string,
      patch?: Partial<
        Pick<
          AgentThread,
          | 'attentionState'
          | 'lastActivityAt'
          | 'pendingInputCount'
          | 'runStatus'
        >
      >,
    ) => {
      updateThreadSummary(threadId, {
        attentionState: 'running',
        lastActivityAt: patch?.lastActivityAt ?? new Date().toISOString(),
        pendingInputCount: patch?.pendingInputCount ?? 0,
        runStatus: patch?.runStatus ?? 'running',
      });
    },
    [updateThreadSummary],
  );

  const restoreThreadFromSnapshot = useCallback(
    async (threadId: string) => {
      await restoreThreadFromSnapshotFn(threadId, {
        apiService,
        clearCompletionWatchdog,
        clearPendingCompletionIfThread: (id) => {
          if (streamRuntime.pendingCompletionRef.current?.threadId === id) {
            streamRuntime.pendingCompletionRef.current = null;
            clearCompletionWatchdog();
          }
        },
        clearPendingInputRequest,
        resetStreamState,
        setActiveRun,
        setError,
        setLatestProposedPlan,
        setMessages,
        setPendingInputRequest,
        setRunStartedAt,
        setWorkEvents,
        updateThreadSummary,
      });
    },
    [
      apiService,
      clearCompletionWatchdog,
      clearPendingInputRequest,
      resetStreamState,
      setActiveRun,
      setError,
      setMessages,
      setLatestProposedPlan,
      setPendingInputRequest,
      setRunStartedAt,
      setWorkEvents,
      updateThreadSummary,
    ],
  );

  useEffect(() => {
    const previousConnectionState = previousConnectionStateRef.current;
    previousConnectionStateRef.current = connectionState;

    // Every hook mount starts at 'connecting' before the shared manager reports
    // its real state, so only a transition out of a lost connection counts as a
    // reconnect. Treating the initial connect as one re-fetched the snapshot and
    // refreshed the sidebar on every route change.
    if (
      connectionState !== 'connected' ||
      previousConnectionState === 'connected' ||
      previousConnectionState === 'connecting'
    ) {
      return;
    }

    const currentState = useAgentChatStore.getState();
    const currentThreadId = currentState.activeThreadId;

    if (
      currentThreadId &&
      !hasLiveReconnectStream({
        isStreaming: currentState.stream.isStreaming,
        pendingUiActionCount: currentState.stream.pendingUiActions?.length ?? 0,
      })
    ) {
      void restoreThreadFromSnapshot(currentThreadId).catch(() => undefined);
    }
  }, [connectionState, restoreThreadFromSnapshot]);

  const syncThreadState = useCallback(
    (
      threadId: string,
      content: string,
      existingThreadTitle?: string,
      createdAt?: string,
      planModeEnabled?: boolean,
      contextVersion?: number,
      brandId?: string | null,
    ) => {
      syncAgentThreadFromTurn({
        activeThreadId,
        brandId,
        contextVersion,
        createdAt,
        planModeEnabled,
        setActiveThread,
        threadId,
        title: existingThreadTitle || content.slice(0, 60),
        upsertThread,
      });
    },
    [activeThreadId, setActiveThread, upsertThread],
  );

  const completeOnboardingIfNeeded = useCallback(
    async (
      toolCalls: Array<{ status: 'completed' | 'failed'; toolName: string }>,
    ) => {
      const hasCompletedOnboarding = toolCalls.some(
        (toolCall) =>
          toolCall.toolName === 'complete_onboarding' &&
          toolCall.status === 'completed',
      );

      if (hasCompletedOnboarding && onOnboardingCompleted) {
        await onOnboardingCompleted();
      }
    },
    [onOnboardingCompleted],
  );

  const scheduleCompletionWatchdog = useCallback(() => {
    clearCompletionWatchdog();

    if (!streamRuntime.pendingCompletionRef.current) {
      return;
    }

    streamRuntime.completionTimeoutRef.current = setTimeout(() => {
      const pending = streamRuntime.pendingCompletionRef.current;

      if (!pending) {
        return;
      }

      void resolveStreamFromMessagesRef.current?.(pending);
    }, STREAM_COMPLETION_POLL_INTERVAL_MS);
  }, [clearCompletionWatchdog]);

  const resolveStreamFromMessages = useCallback(
    async (pending: PendingStreamCompletion) => {
      await resolveStreamFromMessagesFn(pending, {
        apiService,
        cleanupSubscriptions,
        clearCompletionWatchdog,
        clearPendingInputRequest,
        clearPendingCompletion: (threadId) => {
          if (
            streamRuntime.pendingCompletionRef.current?.threadId === threadId
          ) {
            streamRuntime.pendingCompletionRef.current = null;
          }
        },
        isCurrentPendingThread: (threadId) =>
          streamRuntime.pendingCompletionRef.current?.threadId === threadId,
        isThreadVisible,
        resetStreamState,
        scheduleCompletionWatchdog,
        setActiveRun,
        setActiveRunStatus,
        setError,
        setMessages,
        updateThreadSummary,
      });
    },
    [
      apiService,
      cleanupSubscriptions,
      clearCompletionWatchdog,
      clearPendingInputRequest,
      resetStreamState,
      scheduleCompletionWatchdog,
      setActiveRun,
      setActiveRunStatus,
      setError,
      setMessages,
      isThreadVisible,
      updateThreadSummary,
    ],
  );

  useEffect(() => {
    resolveStreamFromMessagesRef.current = resolveStreamFromMessages;
  }, [resolveStreamFromMessages]);

  const touchCompletionWatchdog = useCallback(() => {
    if (!streamRuntime.pendingCompletionRef.current) {
      return;
    }

    scheduleCompletionWatchdog();
  }, [scheduleCompletionWatchdog]);

  const attachSubscriptions = useCallback(() => {
    streamRuntime.unsubscribersRef.current.push(
      ...attachAgentStreamSubscriptions({
        activeStreamThreadRef: streamRuntime.activeStreamThreadRef,
        addActiveToolCall,
        addPendingUiActions,
        addWorkEvent,
        appendStreamToken,
        bufferedEventsRef: streamRuntime.bufferedEventsRef,
        cleanupSubscriptions,
        clearCompletionWatchdog,
        clearPendingInputRequest,
        completeOnboardingIfNeeded,
        finalizeStream,
        isThreadVisible,
        markThreadRunning,
        pendingCompletionRef: streamRuntime.pendingCompletionRef,
        resetStreamState,
        setActiveRun,
        setActiveRunStatus,
        setCreditsRemaining,
        setError,
        setPendingInputRequest,
        setRunStartedAt,
        setStreamingReasoning,
        subscribe,
        touchCompletionWatchdog,
        updateActiveToolCall,
        updateThreadSummary,
      }),
    );
  }, [
    addActiveToolCall,
    addPendingUiActions,
    addWorkEvent,
    appendStreamToken,
    cleanupSubscriptions,
    clearCompletionWatchdog,
    clearPendingInputRequest,
    completeOnboardingIfNeeded,
    finalizeStream,
    isThreadVisible,
    markThreadRunning,
    resetStreamState,
    setActiveRun,
    setActiveRunStatus,
    setCreditsRemaining,
    setError,
    setPendingInputRequest,
    setRunStartedAt,
    setStreamingReasoning,
    subscribe,
    touchCompletionWatchdog,
    updateActiveToolCall,
    updateThreadSummary,
  ]);

  // Adopt a run that is already in flight for this thread.
  //
  // Subscriptions, the buffered-event queue, and `pendingCompletionRef` all live
  // in refs, so they die with the component instance. Sending the first message
  // on `/agent/new` makes the layout `replace()` to `/agent/:id`, and a route
  // *segment* swap remounts this whole subtree mid-run: the unmount effect tears
  // the socket listeners down, every remaining event (including `agent:done`)
  // lands on dead handlers, and the module-level store stays `isStreaming: true`
  // forever. The user sees an empty track stuck on WORKING until a hard refresh.
  //
  // Re-attaching here — and rebuilding the watchdog state from the store, which
  // *does* survive the remount — makes the new instance take over the live run.
  useEffect(() => {
    if (!isReady || !activeThreadId) {
      return;
    }

    const state = useAgentChatStore.getState();

    if (!state.stream.isStreaming) {
      return;
    }

    // The shared runtime already owns this stream — `sendMessage` attached the
    // subscriptions on this or another live instance.
    const ownedThreadId = streamRuntime.activeStreamThreadRef.current;

    if (ownedThreadId && ownedThreadId !== activeThreadId) {
      return;
    }

    if (
      ownedThreadId === activeThreadId &&
      streamRuntime.unsubscribersRef.current.length > 0
    ) {
      return;
    }

    streamRuntime.activeStreamThreadRef.current = activeThreadId;
    attachSubscriptions();
    streamRuntime.pendingCompletionRef.current = {
      initiatedAt: Date.now(),
      preAssistantIds: collectAssistantMessageIds(state.messages),
      runId: state.activeRunId,
      startedAt: state.runStartedAt,
      threadId: activeThreadId,
    };
    scheduleCompletionWatchdog();
    flushBufferedEvents(activeThreadId);
  }, [
    activeThreadId,
    attachSubscriptions,
    flushBufferedEvents,
    isReady,
    scheduleCompletionWatchdog,
  ]);

  const sendMessage = useCallback(
    async (content: string, sendOptions?: SendStreamMessageOptions) => {
      if (sendOptions?.signal?.aborted) {
        return;
      }

      const currentActiveThreadId = sendOptions?.forceNewThread
        ? null
        : useAgentChatStore.getState().activeThreadId;

      const preAssistantIds = collectAssistantMessageIds(
        useAgentChatStore.getState().messages,
      );

      const userMessage: AgentChatMessage = {
        content,
        createdAt: new Date().toISOString(),
        id: `user-${Date.now()}`,
        metadata:
          sendOptions?.attachments?.length ||
          sendOptions?.artifactReferences?.length
            ? {
                ...(sendOptions.attachments?.length
                  ? { attachments: sendOptions.attachments }
                  : {}),
                ...(sendOptions.artifactReferences?.length
                  ? { artifactReferences: sendOptions.artifactReferences }
                  : {}),
              }
            : undefined,
        role: 'user',
        threadId: currentActiveThreadId ?? '',
      };

      addMessage(userMessage);
      setError(null);

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = sendOptions?.signal || abortRef.current.signal;
      streamRuntime.activeStreamThreadRef.current = currentActiveThreadId;
      streamRuntime.bufferedEventsRef.current = [];
      streamRuntime.pendingCompletionRef.current = null;

      setWorkEvents([]);
      clearPendingInputRequest();
      setActiveRun(null, { startedAt: null, status: 'idle' });
      setRunStartedAt(null);
      clearCompletionWatchdog();
      resetStreamState();
      cleanupSubscriptions();

      if (currentActiveThreadId) {
        updateThreadSummary(currentActiveThreadId, {
          attentionState: null,
          lastActivityAt: userMessage.createdAt,
          pendingInputCount: 0,
          runStatus: 'queued',
        });
      }

      useAgentChatStore.setState((state) => ({
        stream: { ...state.stream, isStreaming: true },
      }));

      try {
        attachSubscriptions();

        const resolvedModel = model?.trim() || undefined;
        const requestPageContext = toAgentRequestPageContext(pageContext);
        const currentThread = useAgentChatStore
          .getState()
          .threads.find((item) => item.id === currentActiveThreadId);
        const clientRequestId =
          sendOptions?.clientRequestId ?? createClientRequestId();
        const startTurn = () =>
          runAgentApiEffect(
            apiService.chatStreamEffect(
              {
                artifactReferences: sendOptions?.artifactReferences,
                attachments: sendOptions?.attachments,
                brandId: sendOptions?.brandId ?? currentThread?.brandId ?? null,
                clientRequestId,
                content,
                expectedContextVersion: currentThread?.contextVersion,
                generationMode: sendOptions?.generationMode,
                generationSettings: sendOptions?.generationSettings,
                model: resolvedModel,
                pageContext: requestPageContext,
                planModeEnabled: sendOptions?.planModeEnabled,
                source: sendOptions?.source,
                threadId: currentActiveThreadId ?? undefined,
              },
              signal,
            ),
          );
        let response: AgentChatStreamResponse;
        try {
          response = await startTurn();
        } catch (error: unknown) {
          if (signal.aborted || !isAmbiguousAcknowledgementError(error)) {
            throw error;
          }
          response = await startTurn();
        }

        const acceptedAt = response.queuedAt;

        streamRuntime.activeStreamThreadRef.current = response.threadId;
        streamRuntime.pendingCompletionRef.current = {
          initiatedAt: Date.now(),
          preAssistantIds,
          runId: response.executionId,
          startedAt: acceptedAt,
          threadId: response.threadId,
        };
        const existingThread = useAgentChatStore
          .getState()
          .threads.find((item) => item.id === response.threadId);
        syncThreadState(
          response.threadId,
          content,
          existingThread?.title,
          existingThread?.createdAt,
          existingThread?.planModeEnabled ?? sendOptions?.planModeEnabled,
          response.contextVersion,
          response.brandId,
        );
        scheduleCompletionWatchdog();
        flushBufferedEvents(response.threadId);
        setActiveRun(response.executionId, {
          startedAt: acceptedAt,
          status: 'running',
        });
        markThreadRunning(response.threadId, {
          lastActivityAt: acceptedAt,
          runStatus: 'running',
        });
      } catch (err) {
        if (signal.aborted) {
          return;
        }

        streamRuntime.pendingCompletionRef.current = null;
        clearCompletionWatchdog();
        if (currentActiveThreadId) {
          updateThreadSummary(currentActiveThreadId, {
            attentionState: null,
            lastActivityAt: new Date().toISOString(),
            runStatus: 'failed',
          });
        }
        setError(serializeAgentError(err));
        setActiveRunStatus('failed');
        resetStreamState();
        cleanupSubscriptions();
      }
    },
    [
      model,
      pageContext,
      apiService,
      attachSubscriptions,
      addMessage,
      setError,
      setWorkEvents,
      clearPendingInputRequest,
      resetStreamState,
      cleanupSubscriptions,
      clearCompletionWatchdog,
      flushBufferedEvents,
      scheduleCompletionWatchdog,
      setActiveRun,
      setActiveRunStatus,
      setRunStartedAt,
      updateThreadSummary,
      markThreadRunning,
      syncThreadState,
    ],
  );

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    streamRuntime.pendingCompletionRef.current = null;
    clearCompletionWatchdog();
    cleanupSubscriptions();
    resetStreamState();
    clearMessages();
  }, [
    clearMessages,
    cleanupSubscriptions,
    clearCompletionWatchdog,
    resetStreamState,
  ]);

  return { clearChat, isStreaming, sendMessage };
}
