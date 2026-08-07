'use client';

import { resolveStreamFromMessages as resolveStreamFromMessagesFn } from '@genfeedai/agent/hooks/agent-chat-stream.completion';
import {
  collectAssistantMessageIds,
  flushBufferedEventsForThread,
} from '@genfeedai/agent/hooks/agent-chat-stream.helpers';
import { restoreThreadFromSnapshot as restoreThreadFromSnapshotFn } from '@genfeedai/agent/hooks/agent-chat-stream.restore';
import { attachAgentStreamSubscriptions } from '@genfeedai/agent/hooks/agent-chat-stream.subscriptions';
import type {
  BufferedThreadEvent,
  PendingStreamCompletion,
  SendStreamMessageOptions,
  UseAgentChatStreamOptions,
  UseAgentChatStreamReturn,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { STREAM_COMPLETION_POLL_INTERVAL_MS } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type {
  AgentChatMessage,
  AgentThread,
} from '@genfeedai/agent/models/agent-chat.model';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { toAgentRequestPageContext } from '@genfeedai/agent/utils/agent-page-context.util';
import { applyDashboardOperation } from '@genfeedai/agent/utils/apply-dashboard-operation';
import { mapToolCallResponse } from '@genfeedai/agent/utils/map-tool-call-response';
import { AgentThreadStatus } from '@genfeedai/enums';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useCallback, useEffect, useRef } from 'react';

export type {
  SendStreamMessageOptions,
  UseAgentChatStreamOptions,
  UseAgentChatStreamReturn,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';

export function useAgentChatStream(
  options: UseAgentChatStreamOptions,
): UseAgentChatStreamReturn {
  const { apiService, model, onOnboardingCompleted } = options;
  const { connectionState, getSocketManager, subscribe, isReady } =
    useSocketManager();

  const addMessage = useAgentChatStore((s) => s.addMessage);
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const setActiveThread = useAgentChatStore((s) => s.setActiveThread);
  const upsertThread = useAgentChatStore((s) => s.upsertThread);
  const setError = useAgentChatStore((s) => s.setError);
  const setIsGenerating = useAgentChatStore((s) => s.setIsGenerating);
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
  const activeStreamThreadRef = useRef<string | null>(null);
  const bufferedEventsRef = useRef<BufferedThreadEvent[]>([]);
  const unsubscribersRef = useRef<Array<() => void>>([]);
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingCompletionRef = useRef<PendingStreamCompletion | null>(null);
  const resolveStreamFromMessagesRef = useRef<
    ((pending: PendingStreamCompletion) => Promise<void>) | null
  >(null);
  const previousConnectionStateRef = useRef(connectionState);

  const clearCompletionWatchdog = useCallback(() => {
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
  }, []);

  const cleanupSubscriptions = useCallback(() => {
    for (const unsub of unsubscribersRef.current) {
      unsub();
    }
    unsubscribersRef.current = [];
    bufferedEventsRef.current = [];
  }, []);

  const flushBufferedEvents = useCallback((threadId: string) => {
    bufferedEventsRef.current = flushBufferedEventsForThread(
      bufferedEventsRef.current,
      threadId,
    );
  }, []);

  useEffect(() => {
    setSocketConnectionState(connectionState);
  }, [connectionState, setSocketConnectionState]);

  useEffect(() => {
    return () => {
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
          if (pendingCompletionRef.current?.threadId === id) {
            pendingCompletionRef.current = null;
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

    if (
      connectionState !== 'connected' ||
      previousConnectionState === 'connected'
    ) {
      return;
    }

    const currentThreadId = useAgentChatStore.getState().activeThreadId;

    if (currentThreadId) {
      void restoreThreadFromSnapshot(currentThreadId).catch(() => undefined);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('agent:threads:refresh'));
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
      if (threadId !== activeThreadId) {
        setActiveThread(threadId);
      }

      const now = new Date().toISOString();
      upsertThread({
        brandId,
        createdAt: createdAt ?? now,
        contextVersion: contextVersion ?? 1,
        id: threadId,
        planModeEnabled,
        status: AgentThreadStatus.ACTIVE,
        title: existingThreadTitle || content.slice(0, 60),
        updatedAt: now,
      });

      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.dispatchEvent(new Event('agent:threads:refresh'));
        }, 2000);
      }
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

  const completeNonStreamingTurn = useCallback(
    async (
      content: string,
      sendOptions?: SendStreamMessageOptions,
      threadIdOverride?: string | null,
    ) => {
      setIsGenerating(true);

      try {
        const resolvedModel = model?.trim() || undefined;
        const requestPageContext = toAgentRequestPageContext(pageContext);
        const currentThread = useAgentChatStore
          .getState()
          .threads.find((item) => item.id === threadIdOverride);
        const response = await runAgentApiEffect(
          apiService.chatEffect(
            {
              artifactReferences: sendOptions?.artifactReferences,
              attachments: sendOptions?.attachments,
              brandId: sendOptions?.brandId ?? currentThread?.brandId ?? null,
              content,
              expectedContextVersion: currentThread?.contextVersion,
              model: resolvedModel,
              pageContext: requestPageContext,
              planModeEnabled: sendOptions?.planModeEnabled,
              source: sendOptions?.source,
              threadId: threadIdOverride ?? undefined,
            },
            sendOptions?.signal,
          ),
        );

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
        updateThreadSummary(response.threadId, {
          attentionState: null,
          lastActivityAt: new Date().toISOString(),
          lastAssistantPreview: response.message.content.slice(0, 280),
          pendingInputCount: 0,
          runStatus: 'completed',
        });
        setCreditsRemaining(response.creditsRemaining);

        const assistantMessage: AgentChatMessage = {
          content: response.message.content,
          createdAt: new Date().toISOString(),
          id: `assistant-${Date.now()}`,
          metadata: {
            toolCalls: response.toolCalls.map(mapToolCallResponse),
            ...response.message.metadata,
          },
          role: 'assistant',
          threadId: response.threadId,
        };

        addMessage(assistantMessage);
        setLatestProposedPlan(
          (response.message.metadata?.proposedPlan as
            | Parameters<typeof setLatestProposedPlan>[0]
            | undefined) ?? null,
        );

        const metadata = response.message.metadata;
        const uiBlocksState =
          metadata?.uiBlocks &&
          typeof metadata.uiBlocks === 'object' &&
          !Array.isArray(metadata.uiBlocks)
            ? (metadata.uiBlocks as Record<string, unknown>)
            : null;
        const dashboardOperation =
          typeof metadata?.dashboardOperation === 'string'
            ? metadata.dashboardOperation
            : typeof uiBlocksState?.operation === 'string'
              ? uiBlocksState.operation
              : undefined;
        const dashboardPayload =
          uiBlocksState?.blocks ??
          (uiBlocksState?.components ? uiBlocksState : metadata?.uiBlocks);

        if (dashboardOperation && metadata?.uiBlocks) {
          applyDashboardOperation(
            dashboardOperation,
            dashboardPayload,
            uiBlocksState?.blockIds ?? metadata.blockIds,
          );
        }

        await completeOnboardingIfNeeded(response.toolCalls);
      } finally {
        if (!sendOptions?.signal?.aborted) {
          setIsGenerating(false);
        }
      }
    },
    [
      addMessage,
      apiService,
      completeOnboardingIfNeeded,
      model,
      pageContext,
      setCreditsRemaining,
      setIsGenerating,
      setLatestProposedPlan,
      updateThreadSummary,
      syncThreadState,
    ],
  );

  const scheduleCompletionWatchdog = useCallback(() => {
    clearCompletionWatchdog();

    if (!pendingCompletionRef.current) {
      return;
    }

    completionTimeoutRef.current = setTimeout(() => {
      const pending = pendingCompletionRef.current;

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
          if (pendingCompletionRef.current?.threadId === threadId) {
            pendingCompletionRef.current = null;
          }
        },
        isCurrentPendingThread: (threadId) =>
          pendingCompletionRef.current?.threadId === threadId,
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
    if (!pendingCompletionRef.current) {
      return;
    }

    scheduleCompletionWatchdog();
  }, [scheduleCompletionWatchdog]);

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
      activeStreamThreadRef.current = currentActiveThreadId;
      bufferedEventsRef.current = [];
      pendingCompletionRef.current = null;

      setWorkEvents([]);
      clearPendingInputRequest();
      setActiveRun(null, { startedAt: null, status: 'idle' });
      setRunStartedAt(null);
      clearCompletionWatchdog();
      resetStreamState();
      cleanupSubscriptions();

      const socketManager = getSocketManager();
      const canStream = isReady && Boolean(socketManager?.isConnected?.());

      if (currentActiveThreadId) {
        updateThreadSummary(currentActiveThreadId, {
          attentionState: null,
          lastActivityAt: userMessage.createdAt,
          pendingInputCount: 0,
          runStatus: 'queued',
        });
      }

      if (!canStream) {
        await completeNonStreamingTurn(
          content,
          sendOptions,
          currentActiveThreadId,
        );
        return;
      }

      useAgentChatStore.setState((state) => ({
        stream: { ...state.stream, isStreaming: true },
      }));

      try {
        unsubscribersRef.current.push(
          ...attachAgentStreamSubscriptions({
            activeStreamThreadRef,
            addActiveToolCall,
            addPendingUiActions,
            addWorkEvent,
            appendStreamToken,
            bufferedEventsRef,
            cleanupSubscriptions,
            clearCompletionWatchdog,
            clearPendingInputRequest,
            completeOnboardingIfNeeded,
            finalizeStream,
            isThreadVisible,
            markThreadRunning,
            pendingCompletionRef,
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

        const resolvedModel = model?.trim() || undefined;
        const requestPageContext = toAgentRequestPageContext(pageContext);
        const currentThread = useAgentChatStore
          .getState()
          .threads.find((item) => item.id === currentActiveThreadId);
        const response = await runAgentApiEffect(
          apiService.chatStreamEffect(
            {
              artifactReferences: sendOptions?.artifactReferences,
              attachments: sendOptions?.attachments,
              brandId: sendOptions?.brandId ?? currentThread?.brandId ?? null,
              content,
              expectedContextVersion: currentThread?.contextVersion,
              model: resolvedModel,
              pageContext: requestPageContext,
              planModeEnabled: sendOptions?.planModeEnabled,
              source: sendOptions?.source,
              threadId: currentActiveThreadId ?? undefined,
            },
            signal,
          ),
        );

        activeStreamThreadRef.current = response.threadId;
        pendingCompletionRef.current = {
          initiatedAt: Date.now(),
          preAssistantIds,
          runId: response.runId,
          startedAt: response.startedAt ?? null,
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
        setActiveRun(response.runId, {
          startedAt: response.startedAt,
          status: 'running',
        });
        markThreadRunning(response.threadId, {
          lastActivityAt: response.startedAt,
          runStatus: 'running',
        });
      } catch (err) {
        if (signal.aborted) {
          return;
        }

        pendingCompletionRef.current = null;
        clearCompletionWatchdog();
        if (currentActiveThreadId) {
          updateThreadSummary(currentActiveThreadId, {
            attentionState: null,
            lastActivityAt: new Date().toISOString(),
            runStatus: 'failed',
          });
        }
        setError(
          err instanceof Error ? err.message : 'Failed to start streaming',
        );
        setActiveRunStatus('failed');
        resetStreamState();
        cleanupSubscriptions();
      }
    },
    [
      model,
      pageContext,
      apiService,
      isReady,
      subscribe,
      addMessage,
      setError,
      setCreditsRemaining,
      addWorkEvent,
      setWorkEvents,
      appendStreamToken,
      clearPendingInputRequest,
      setStreamingReasoning,
      addActiveToolCall,
      addPendingUiActions,
      updateActiveToolCall,
      finalizeStream,
      resetStreamState,
      cleanupSubscriptions,
      clearCompletionWatchdog,
      completeNonStreamingTurn,
      completeOnboardingIfNeeded,
      flushBufferedEvents,
      getSocketManager,
      scheduleCompletionWatchdog,
      setActiveRun,
      setActiveRunStatus,
      setPendingInputRequest,
      setRunStartedAt,
      updateThreadSummary,
      isThreadVisible,
      markThreadRunning,
      syncThreadState,
      touchCompletionWatchdog,
    ],
  );

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    pendingCompletionRef.current = null;
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
