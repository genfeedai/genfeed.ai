'use client';

import { DEFAULT_RUNTIME_AGENT_MODEL } from '@genfeedai/agent/constants/agent-runtime-model.constant';
import type {
  AgentChatMessage,
  AgentInputRequestPayload,
  AgentInputResolvedPayload,
  AgentStreamDonePayload,
  AgentStreamErrorPayload,
  AgentStreamReasoningPayload,
  AgentStreamStartPayload,
  AgentStreamTokenPayload,
  AgentStreamToolCompletePayload,
  AgentStreamToolStartPayload,
  AgentStreamUIBlocksPayload,
  AgentThread,
  AgentWorkEventPayload,
} from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  buildThreadSummaryFromSnapshot,
  mapSnapshotPendingInputRequest,
  mapSnapshotRunStatus,
  mapSnapshotWorkEvents,
} from '@genfeedai/agent/utils/agent-thread-snapshot.util';
import { applyDashboardOperation } from '@genfeedai/agent/utils/apply-dashboard-operation';
import { mapToolCallResponse } from '@genfeedai/agent/utils/map-tool-call-response';
import { AgentThreadStatus } from '@genfeedai/enums';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import type { ChatAttachment } from '@props/ui/attachments.props';
import { useCallback, useEffect, useRef } from 'react';

interface UseAgentChatStreamOptions {
  apiService: AgentApiService;
  model?: string;
  onOnboardingCompleted?: () => void | Promise<void>;
}

interface SendStreamMessageOptions {
  forceNewThread?: boolean;
  source?: 'agent' | 'proactive' | 'onboarding';
  signal?: AbortSignal;
  attachments?: ChatAttachment[];
  planModeEnabled?: boolean;
}

interface UseAgentChatStreamReturn {
  sendMessage: (
    content: string,
    options?: SendStreamMessageOptions,
  ) => Promise<void>;
  clearChat: () => void;
  isStreaming: boolean;
}

interface BufferedThreadEvent {
  threadId?: string;
  data: unknown;
  handler: (data: unknown) => void;
}

interface PendingStreamCompletion {
  initiatedAt: number;
  preAssistantIds: Set<string>;
  runId: string | null;
  startedAt: string | null;
  threadId: string;
}

const STREAM_COMPLETION_POLL_INTERVAL_MS = 10_000;
const STREAM_COMPLETION_GRACE_PERIOD_MS = 90_000;

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
    const remainingEvents: BufferedThreadEvent[] = [];

    for (const event of bufferedEventsRef.current) {
      if (event.threadId === threadId) {
        event.handler(event.data);
        continue;
      }

      remainingEvents.push(event);
    }

    bufferedEventsRef.current = remainingEvents;
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
      const [snapshot, messages] = await Promise.all([
        runAgentApiEffect(apiService.getThreadSnapshotEffect(threadId)),
        runAgentApiEffect(
          apiService.getMessagesEffect(threadId, { limit: 100 }),
        ),
      ]);

      const state = useAgentChatStore.getState();
      const existingThread = state.threads.find(
        (thread) => thread.id === threadId,
      );
      const isVisible = state.activeThreadId === threadId;

      updateThreadSummary(threadId, {
        ...buildThreadSummaryFromSnapshot(snapshot, {
          existingThread,
          isVisible,
        }),
      });

      if (
        !snapshot.activeRun &&
        pendingCompletionRef.current?.threadId === threadId
      ) {
        pendingCompletionRef.current = null;
        clearCompletionWatchdog();
      }

      if (!isVisible) {
        return;
      }

      const pendingInputRequest = mapSnapshotPendingInputRequest(snapshot);

      setMessages(messages);
      setLatestProposedPlan(snapshot.latestProposedPlan ?? null);
      setPendingInputRequest(pendingInputRequest);
      setWorkEvents(mapSnapshotWorkEvents(snapshot));
      setActiveRun(snapshot.activeRun?.runId ?? null, {
        startedAt: snapshot.activeRun?.startedAt ?? null,
        status: mapSnapshotRunStatus(snapshot.activeRun?.status),
      });
      setRunStartedAt(snapshot.activeRun?.startedAt ?? null);

      if (!snapshot.activeRun && !pendingInputRequest) {
        resetStreamState();
        clearPendingInputRequest();
      }

      setError(null);
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
    ) => {
      if (threadId !== activeThreadId) {
        setActiveThread(threadId);
      }

      const now = new Date().toISOString();
      upsertThread({
        createdAt: createdAt ?? now,
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
        const resolvedModel = model?.trim() || DEFAULT_RUNTIME_AGENT_MODEL;
        const response = await runAgentApiEffect(
          apiService.chatEffect(
            {
              attachments: sendOptions?.attachments,
              content,
              model: resolvedModel,
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
        if (metadata?.uiBlocks && metadata?.dashboardOperation) {
          applyDashboardOperation(
            metadata.dashboardOperation as Parameters<
              typeof applyDashboardOperation
            >[0],
            metadata.uiBlocks as Parameters<typeof applyDashboardOperation>[1],
            metadata.blockIds as Parameters<typeof applyDashboardOperation>[2],
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
      const hasExceededGracePeriod =
        Date.now() - pending.initiatedAt >= STREAM_COMPLETION_GRACE_PERIOD_MS;

      try {
        const messages = await runAgentApiEffect(
          apiService.getMessagesEffect(pending.threadId, {
            limit: 100,
          }),
        );

        const recoveredAssistantMessage = [...messages]
          .reverse()
          .find(
            (message) =>
              message.role === 'assistant' &&
              !pending.preAssistantIds.has(message.id),
          );

        if (!recoveredAssistantMessage) {
          if (!hasExceededGracePeriod) {
            scheduleCompletionWatchdog();
            return;
          }

          throw new Error(
            'Agent run did not finish before the recovery timeout.',
          );
        }

        resetStreamState();
        setMessages(messages);
        updateThreadSummary(pending.threadId, {
          attentionState: isThreadVisible(pending.threadId) ? null : 'updated',
          lastActivityAt:
            recoveredAssistantMessage.createdAt ?? new Date().toISOString(),
          lastAssistantPreview: recoveredAssistantMessage.content.slice(0, 280),
          pendingInputCount: 0,
          runStatus: 'completed',
        });
        if (isThreadVisible(pending.threadId)) {
          setError(null);
          clearPendingInputRequest();
          setActiveRun(pending.runId, {
            startedAt: pending.startedAt,
            status: 'completed',
          });
        }
      } catch (error) {
        if (!hasExceededGracePeriod) {
          scheduleCompletionWatchdog();
          return;
        }

        updateThreadSummary(pending.threadId, {
          attentionState: isThreadVisible(pending.threadId) ? null : 'updated',
          lastActivityAt: new Date().toISOString(),
          runStatus: 'failed',
        });
        if (isThreadVisible(pending.threadId)) {
          setError(
            error instanceof Error
              ? error.message
              : 'Agent run did not finish before the recovery timeout.',
          );
          setActiveRunStatus('failed');
          resetStreamState();
        }
      } finally {
        const isCurrentPendingThread =
          pendingCompletionRef.current?.threadId === pending.threadId;

        if (isCurrentPendingThread && hasExceededGracePeriod) {
          pendingCompletionRef.current = null;
          clearCompletionWatchdog();
          cleanupSubscriptions();
        }
      }
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

      const preAssistantIds = new Set(
        useAgentChatStore
          .getState()
          .messages.filter((message) => message.role === 'assistant')
          .map((message) => message.id),
      );

      const userMessage: AgentChatMessage = {
        content,
        createdAt: new Date().toISOString(),
        id: `user-${Date.now()}`,
        metadata: sendOptions?.attachments?.length
          ? { attachments: sendOptions.attachments }
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
        const filterByThread =
          (handler: (data: unknown) => void) => (data: unknown) => {
            const payload = data as { threadId?: string };

            if (!activeStreamThreadRef.current) {
              bufferedEventsRef.current.push({
                data,
                handler,
                threadId: payload.threadId,
              });
              return;
            }

            if (payload.threadId === activeStreamThreadRef.current) {
              handler(data);
            }
          };

        unsubscribersRef.current.push(
          subscribe<AgentStreamStartPayload>(
            'agent:stream_start',
            filterByThread((data) => {
              const payload = data as AgentStreamStartPayload;
              touchCompletionWatchdog();
              markThreadRunning(payload.threadId, {
                lastActivityAt: payload.startedAt ?? new Date().toISOString(),
              });

              if (payload.runId && isThreadVisible(payload.threadId)) {
                setActiveRun(payload.runId, {
                  startedAt: payload.startedAt ?? null,
                  status: 'running',
                });
              }

              if (payload.startedAt && isThreadVisible(payload.threadId)) {
                setRunStartedAt(payload.startedAt);
              }
            }),
          ),
        );

        unsubscribersRef.current.push(
          subscribe<AgentStreamTokenPayload>(
            'agent:token',
            filterByThread((data) => {
              const payload = data as AgentStreamTokenPayload;
              touchCompletionWatchdog();
              markThreadRunning(payload.threadId);
              if (isThreadVisible(payload.threadId)) {
                appendStreamToken(payload.token);
              }
            }),
          ),
        );

        unsubscribersRef.current.push(
          subscribe<AgentStreamReasoningPayload>(
            'agent:reasoning',
            filterByThread((data) => {
              const payload = data as AgentStreamReasoningPayload;
              touchCompletionWatchdog();
              markThreadRunning(payload.threadId);
              if (isThreadVisible(payload.threadId)) {
                setStreamingReasoning(payload.content);
              }
            }),
          ),
        );

        unsubscribersRef.current.push(
          subscribe<AgentStreamToolStartPayload>(
            'agent:tool_start',
            filterByThread((data) => {
              const payload = data as AgentStreamToolStartPayload;
              touchCompletionWatchdog();
              markThreadRunning(payload.threadId);
              if (isThreadVisible(payload.threadId)) {
                addActiveToolCall({
                  arguments: payload.parameters,
                  detail: payload.detail,
                  id: payload.toolCallId,
                  label: payload.label,
                  name: payload.toolName,
                  parameters: payload.parameters,
                  phase: payload.phase,
                  progress: payload.progress,
                  startedAt: payload.startedAt ?? payload.timestamp,
                  status: 'running',
                });
              }
            }),
          ),
        );

        unsubscribersRef.current.push(
          subscribe<AgentStreamToolCompletePayload>(
            'agent:tool_complete',
            filterByThread((data) => {
              const payload = data as AgentStreamToolCompletePayload;
              touchCompletionWatchdog();
              markThreadRunning(payload.threadId);
              if (isThreadVisible(payload.threadId)) {
                updateActiveToolCall(payload.toolCallId, {
                  debug: payload.debug,
                  detail: payload.detail,
                  error: payload.error,
                  estimatedDurationMs: payload.estimatedDurationMs,
                  label: payload.label,
                  phase: payload.phase,
                  progress: payload.progress,
                  remainingDurationMs: payload.remainingDurationMs,
                  resultSummary: payload.resultSummary,
                  status: payload.status,
                });
                if (payload.uiActions?.length) {
                  addPendingUiActions(payload.uiActions);
                }
              }
            }),
          ),
        );

        unsubscribersRef.current.push(
          subscribe<AgentStreamDonePayload>(
            'agent:done',
            filterByThread((data) => {
              const payload = data as AgentStreamDonePayload;

              pendingCompletionRef.current = null;
              clearCompletionWatchdog();

              const assistantMessage: AgentChatMessage = {
                content: payload.fullContent,
                createdAt: new Date().toISOString(),
                id: `assistant-${Date.now()}`,
                metadata: {
                  ...payload.metadata,
                  toolCalls: payload.toolCalls.map(mapToolCallResponse),
                },
                role: 'assistant',
                threadId: payload.threadId,
              };

              updateThreadSummary(payload.threadId, {
                attentionState: isThreadVisible(payload.threadId)
                  ? null
                  : 'updated',
                lastActivityAt: assistantMessage.createdAt,
                lastAssistantPreview: payload.fullContent.slice(0, 280),
                pendingInputCount: 0,
                runStatus: 'completed',
              });
              if (isThreadVisible(payload.threadId)) {
                finalizeStream(assistantMessage);
                setActiveRun(payload.runId ?? null, {
                  startedAt: payload.startedAt ?? null,
                  status: 'completed',
                });
                setCreditsRemaining(payload.creditsRemaining);
                clearPendingInputRequest();
              }
              cleanupSubscriptions();

              Promise.resolve(
                completeOnboardingIfNeeded(payload.toolCalls),
              ).catch(() => {
                // Intentionally swallowed — onboarding completion is fire-and-forget
              });
            }),
          ),
        );

        unsubscribersRef.current.push(
          subscribe<AgentStreamErrorPayload>(
            'agent:error',
            filterByThread((data) => {
              const payload = data as AgentStreamErrorPayload;

              pendingCompletionRef.current = null;
              clearCompletionWatchdog();
              const nextStatus =
                payload.error === 'Agent run cancelled'
                  ? 'cancelled'
                  : 'failed';
              updateThreadSummary(payload.threadId, {
                attentionState: isThreadVisible(payload.threadId)
                  ? null
                  : 'updated',
                lastActivityAt: new Date().toISOString(),
                pendingInputCount: 0,
                runStatus: nextStatus,
              });
              if (isThreadVisible(payload.threadId)) {
                setError(payload.error);
                setActiveRunStatus(nextStatus);
                resetStreamState();
              }
              cleanupSubscriptions();
            }),
          ),
        );

        unsubscribersRef.current.push(
          subscribe<AgentStreamUIBlocksPayload>(
            'agent:ui_blocks',
            filterByThread((data) => {
              const payload = data as AgentStreamUIBlocksPayload;
              touchCompletionWatchdog();
              markThreadRunning(payload.threadId);
              if (isThreadVisible(payload.threadId)) {
                applyDashboardOperation(
                  payload.operation,
                  payload.blocks,
                  payload.blockIds,
                );
              }
            }),
          ),
        );

        unsubscribersRef.current.push(
          subscribe<AgentWorkEventPayload>(
            'agent:work_event',
            filterByThread((data) => {
              const payload = data as AgentWorkEventPayload;
              touchCompletionWatchdog();
              markThreadRunning(payload.threadId, {
                lastActivityAt: payload.timestamp,
              });
              if (isThreadVisible(payload.threadId)) {
                addWorkEvent({
                  createdAt: payload.timestamp,
                  debug: payload.debug,
                  detail: payload.detail,
                  estimatedDurationMs: payload.estimatedDurationMs,
                  event: payload.event,
                  id: `${payload.event}-${payload.toolCallId ?? payload.inputRequestId ?? payload.timestamp}`,
                  inputRequestId: payload.inputRequestId,
                  label: payload.label,
                  parameters: payload.parameters,
                  phase: payload.phase,
                  progress: payload.progress,
                  remainingDurationMs: payload.remainingDurationMs,
                  resultSummary: payload.resultSummary,
                  runId: payload.runId,
                  startedAt: payload.startedAt,
                  status: payload.status,
                  threadId: payload.threadId,
                  toolCallId: payload.toolCallId,
                  toolName: payload.toolName,
                });
              }
            }),
          ),
        );

        unsubscribersRef.current.push(
          subscribe<AgentInputRequestPayload>(
            'agent:input_request',
            filterByThread((data) => {
              const payload = data as AgentInputRequestPayload;
              touchCompletionWatchdog();
              updateThreadSummary(payload.threadId, {
                attentionState: 'needs-input',
                lastActivityAt: payload.timestamp,
                pendingInputCount: 1,
                runStatus: 'waiting_input',
              });
              if (isThreadVisible(payload.threadId)) {
                setPendingInputRequest({
                  allowFreeText: payload.allowFreeText,
                  fieldId: payload.fieldId,
                  inputRequestId: payload.inputRequestId,
                  metadata: payload.metadata,
                  options: payload.options,
                  prompt: payload.prompt,
                  recommendedOptionId: payload.recommendedOptionId,
                  runId: payload.runId,
                  threadId: payload.threadId,
                  title: payload.title,
                });
                addWorkEvent({
                  createdAt: payload.timestamp,
                  detail: payload.prompt,
                  event: AgentWorkEventType.INPUT_REQUESTED,
                  id: `input-request-${payload.inputRequestId}`,
                  inputRequestId: payload.inputRequestId,
                  label: payload.title,
                  runId: payload.runId,
                  status: AgentWorkEventStatus.PENDING,
                  threadId: payload.threadId,
                });
              }
            }),
          ),
        );

        unsubscribersRef.current.push(
          subscribe<AgentInputResolvedPayload>(
            'agent:input_resolved',
            filterByThread((data) => {
              const payload = data as AgentInputResolvedPayload;
              touchCompletionWatchdog();
              markThreadRunning(payload.threadId, {
                lastActivityAt: payload.timestamp,
                pendingInputCount: 0,
                runStatus: 'running',
              });
              if (isThreadVisible(payload.threadId)) {
                clearPendingInputRequest();
                addWorkEvent({
                  createdAt: payload.timestamp,
                  detail: payload.answer,
                  event: AgentWorkEventType.INPUT_SUBMITTED,
                  id: `input-resolved-${payload.inputRequestId}`,
                  inputRequestId: payload.inputRequestId,
                  label: 'User input submitted',
                  runId: payload.runId,
                  status: AgentWorkEventStatus.COMPLETED,
                  threadId: payload.threadId,
                });
              }
            }),
          ),
        );

        const resolvedModel = model?.trim() || DEFAULT_RUNTIME_AGENT_MODEL;
        const response = await runAgentApiEffect(
          apiService.chatStreamEffect(
            {
              attachments: sendOptions?.attachments,
              content,
              model: resolvedModel,
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
