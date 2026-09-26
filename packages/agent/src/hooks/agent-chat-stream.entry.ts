import { resolveStreamFromMessages as resolveStreamFromMessagesFn } from '@genfeedai/agent/hooks/agent-chat-stream.completion';
import {
  collectAssistantMessageIds,
  flushBufferedEventsForThread,
  isForeignRunEvent,
} from '@genfeedai/agent/hooks/agent-chat-stream.helpers';
import {
  bindAgentStreamEntry,
  claimProvisionalAgentEvents,
  getAgentStreamRuntime,
  hasProvisionalAgentProgress,
  isCurrentAgentStreamEntry,
  projectAgentStreamEntry,
  settleAgentStreamEntry,
  subscribeAgentStreamEntry,
} from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import { attachAgentStreamSubscriptions } from '@genfeedai/agent/hooks/agent-chat-stream.subscriptions';
import type {
  AgentRunHandoff,
  AgentStreamEntry,
  PendingStreamCompletion,
  SendStreamMessageOptions,
  UseAgentChatStreamOptions,
  UseAgentChatStreamReturn,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { STREAM_COMPLETION_POLL_INTERVAL_MS } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type {
  AgentChatMessage,
  AgentChatStreamResponse,
  AgentInputRequest,
  AgentThread,
  AgentTurnAcceptedPayload,
} from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { toAgentRequestPageContext } from '@genfeedai/agent/utils/agent-page-context.util';
import {
  buildThreadSummaryFromSnapshot,
  mapSnapshotPendingInputRequest,
  mapSnapshotRunStatus,
  mapSnapshotWorkEvents,
  readSnapshotRunError,
} from '@genfeedai/agent/utils/agent-thread-snapshot.util';
import { serializeAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { syncAgentThreadFromTurn } from '@genfeedai/agent/utils/sync-agent-thread-from-turn';
import type { AgentThreadMode } from '@genfeedai/contracts';

export type {
  SendStreamMessageOptions,
  UseAgentChatStreamOptions,
  UseAgentChatStreamReturn,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';

function isAmbiguousAcknowledgementError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const status = (error as { status?: unknown }).status;
  return status === 0 || status === 408 || status === 504;
}

export function createAgentStreamController(
  entry: AgentStreamEntry,
  options: UseAgentChatStreamOptions,
): UseAgentChatStreamReturn {
  const streamRuntime = entry;
  const presentationStore = entry.presentation;
  const subscribe = <T>(event: string, handler: (payload: T) => void) =>
    subscribeAgentStreamEntry(entry, event, handler);
  const { apiService, model, onOnboardingCompleted } = options;

  const addMessage = presentationStore.getState().addMessage;
  const activeThreadId = entry.activeStreamThreadRef.current;

  const setActiveThread = (threadId: string | null) => {
    if (
      useAgentChatStore.getState().activeThreadId === activeThreadId &&
      (activeThreadId !== null ||
        getAgentStreamRuntime().visibleDraftOwner === entry)
    ) {
      useAgentChatStore.getState().setActiveThread(threadId);
      projectAgentStreamEntry(entry);
    }
  };
  const upsertThread = useAgentChatStore.getState().upsertThread;
  const setError = presentationStore.getState().setError;
  const setMessages = presentationStore.getState().setMessages;
  const setCreditsRemaining = (credits: number) => {
    if (
      useAgentChatStore.getState().activeThreadId ===
      entry.activeStreamThreadRef.current
    )
      useAgentChatStore.getState().setCreditsRemaining(credits);
  };
  const clearMessages = presentationStore.getState().clearMessages;
  const isStreaming = presentationStore.getState().stream.isStreaming;
  const addWorkEvent = presentationStore.getState().addWorkEvent;
  const setActiveRun = presentationStore.getState().setActiveRun;
  const setActiveRunStatus = presentationStore.getState().setActiveRunStatus;
  const setWorkEvents = presentationStore.getState().setWorkEvents;
  const setPendingInputRequest =
    presentationStore.getState().setPendingInputRequest;

  const clearPendingInputRequest =
    presentationStore.getState().clearPendingInputRequest;
  const resolvePendingInputRequest =
    presentationStore.getState().resolvePendingInputRequest;
  const setRunStartedAt = presentationStore.getState().setRunStartedAt;

  const updateThread = useAgentChatStore.getState().updateThread;
  const pageContext = presentationStore.getState().pageContext;

  const appendStreamToken = presentationStore.getState().appendStreamToken;
  const setStreamingReasoning =
    presentationStore.getState().setStreamingReasoning;
  const addActiveToolCall = presentationStore.getState().addActiveToolCall;
  const addPendingUiActions = presentationStore.getState().addPendingUiActions;
  const updateActiveToolCall =
    presentationStore.getState().updateActiveToolCall;
  const finalizeStream = presentationStore.getState().finalizeStream;
  const markStreamLive = presentationStore.getState().markStreamLive;
  const resetStreamState = presentationStore.getState().resetStreamState;

  const abortRef = entry.abortRef;
  const clearCompletionWatchdog = () => {
    if (streamRuntime.completionTimeoutRef.current) {
      clearTimeout(streamRuntime.completionTimeoutRef.current);
      streamRuntime.completionTimeoutRef.current = null;
    }
  };

  const cleanupSubscriptions = (preserveOtherThreads = false) => {
    for (const unsub of streamRuntime.unsubscribersRef.current) {
      unsub();
    }
    streamRuntime.unsubscribersRef.current = [];
    streamRuntime.bufferedEventsRef.current = preserveOtherThreads
      ? streamRuntime.bufferedEventsRef.current.filter(
          (event) =>
            event.threadId !== streamRuntime.activeStreamThreadRef.current,
        )
      : [];
    streamRuntime.activeStreamRunIdRef.current = null;
    streamRuntime.isAwaitingRunIdRef.current = false;
  };

  const releaseCompletedSubscriptions = () => {
    cleanupSubscriptions(true);
    settleAgentStreamEntry(entry);
  };

  const flushBufferedEvents = (threadId: string) => {
    const buffered = entry.bufferedEventsRef.current;
    entry.bufferedEventsRef.current = [];
    entry.bufferBytes = 0;
    if (entry.needsReconciliation) {
      entry.recover?.();
      return;
    }
    const generation = entry.ownerGeneration;
    for (const event of buffered) {
      if (
        !isCurrentAgentStreamEntry(entry) ||
        entry.ownerGeneration !== generation ||
        entry.terminalAt !== null
      )
        break;
      flushBufferedEventsForThread(
        [event],
        threadId,
        entry.activeStreamRunIdRef.current,
      );
    }
  };

  const isThreadVisible = (threadId: string) => {
    return entry.activeStreamThreadRef.current === threadId;
  };

  const updateThreadSummary = (
    threadId: string,
    patch: Partial<AgentThread>,
  ) => {
    const existingThread = useAgentChatStore
      .getState()
      .threads.find((thread) => thread.id === threadId);

    if (!isCurrentAgentStreamEntry(entry) || !existingThread) {
      return;
    }

    const actualVisible =
      useAgentChatStore.getState().activeThreadId === threadId;
    updateThread(threadId, {
      ...patch,
      ...(patch.runStatus === 'completed' ||
      patch.runStatus === 'failed' ||
      patch.runStatus === 'cancelled'
        ? { attentionState: actualVisible ? null : 'updated' }
        : {}),
    });
    useAgentChatStore.setState((state) => {
      if (!(threadId in state.conversationCacheByThread)) {
        return state;
      }
      const cache = { ...state.conversationCacheByThread };
      delete cache[threadId];
      return { conversationCacheByThread: cache };
    });
  };

  const markThreadRunning = (
    threadId: string,
    patch?: Partial<
      Pick<
        AgentThread,
        'attentionState' | 'lastActivityAt' | 'pendingInputCount' | 'runStatus'
      >
    >,
  ) => {
    updateThreadSummary(threadId, {
      attentionState: 'running',
      lastActivityAt: patch?.lastActivityAt ?? new Date().toISOString(),
      pendingInputCount: patch?.pendingInputCount ?? 0,
      runStatus: patch?.runStatus ?? 'running',
    });
  };

  const syncThreadState = (
    threadId: string,
    content: string,
    existingThreadTitle?: string,
    createdAt?: string,
    mode?: AgentThreadMode,
    contextVersion?: number,
    brandId?: string | null,
  ) => {
    syncAgentThreadFromTurn({
      activeThreadId,
      brandId,
      contextVersion,
      createdAt,
      mode,
      setActiveThread,
      threadId,
      title: existingThreadTitle || content.slice(0, 60),
      upsertThread,
    });
  };

  const completeOnboardingIfNeeded = async (
    toolCalls: Array<{ status: 'completed' | 'failed'; toolName: string }>,
  ) => {
    const hasCompletedOnboarding = toolCalls.some(
      (toolCall) =>
        toolCall.toolName === 'complete_onboarding' &&
        toolCall.status === 'completed',
    );

    if (hasCompletedOnboarding && onOnboardingCompleted) {
      const generation = entry.ownerGeneration;
      try {
        await onOnboardingCompleted();
      } catch {
        if (
          !isCurrentAgentStreamEntry(entry) ||
          entry.ownerGeneration !== generation
        )
          return;
        setError(
          'Could not finish setup. Use Skip to workspace to try again, or sign in again if your session expired.',
        );
      }
    }
  };

  const scheduleCompletionWatchdog = () => {
    clearCompletionWatchdog();

    if (
      !isCurrentAgentStreamEntry(entry) ||
      presentationStore.getState().pendingInputRequest ||
      !streamRuntime.pendingCompletionRef.current
    ) {
      return;
    }

    streamRuntime.completionTimeoutRef.current = setTimeout(() => {
      const pending = streamRuntime.pendingCompletionRef.current;

      if (!pending) {
        return;
      }

      if (entry.needsReconciliation) entry.recover?.();
      else void resolveStreamFromMessages(pending);
    }, STREAM_COMPLETION_POLL_INTERVAL_MS);
  };

  const resolveStreamFromMessages = async (
    pending: PendingStreamCompletion,
  ) => {
    const generation = entry.ownerGeneration;
    await resolveStreamFromMessagesFn(pending, {
      apiService,
      cleanupSubscriptions: releaseCompletedSubscriptions,
      clearCompletionWatchdog,
      clearPendingInputRequest,
      clearPendingCompletion: (current) => {
        if (streamRuntime.pendingCompletionRef.current === current) {
          streamRuntime.pendingCompletionRef.current = null;
        }
      },
      isCurrentPending: (current) =>
        isCurrentAgentStreamEntry(entry) &&
        entry.ownerGeneration === generation &&
        streamRuntime.pendingCompletionRef.current === current,
      isThreadVisible,
      resetStreamState,
      scheduleCompletionWatchdog,
      setActiveRun,
      setActiveRunStatus,
      setError,
      setMessages,
      updateThreadSummary,
    });
  };

  const touchCompletionWatchdog = () => {
    if (
      !isCurrentAgentStreamEntry(entry) ||
      presentationStore.getState().pendingInputRequest ||
      !streamRuntime.pendingCompletionRef.current
    ) {
      return;
    }

    scheduleCompletionWatchdog();
  };

  const attachSubscriptions = () => {
    entry.unsubscribersRef.current.push(
      subscribe<AgentTurnAcceptedPayload>('agent:turn_accepted', (payload) => {
        if (
          payload.clientRequestId !== entry.clientRequestId ||
          (!entry.activeStreamThreadRef.current &&
            hasProvisionalAgentProgress(payload.threadId, payload.runId)) ||
          (entry.hasProgress &&
            (!entry.isAwaitingRunIdRef.current ||
              entry.needsReconciliation ||
              entry.bufferedEventsRef.current.some(
                (event) =>
                  event.threadId === payload.threadId &&
                  !isForeignRunEvent(event.runId, payload.runId),
              ))) ||
          entry.terminalAt !== null ||
          (entry.activeStreamRunIdRef.current &&
            payload.runId !== entry.activeStreamRunIdRef.current) ||
          presentationStore.getState().stream.acceptedReceipt
        )
          return;
        presentationStore.setState((state) => ({
          stream: { ...state.stream, acceptedReceipt: payload },
        }));
      }),
    );
    streamRuntime.unsubscribersRef.current.push(
      ...attachAgentStreamSubscriptions({
        activeStreamRunIdRef: streamRuntime.activeStreamRunIdRef,
        activeStreamThreadRef: streamRuntime.activeStreamThreadRef,
        addActiveToolCall,
        addPendingUiActions,
        addWorkEvent,
        appendStreamToken,
        bufferedEventsRef: streamRuntime.bufferedEventsRef,
        bufferEvent: (event) => {
          if (entry.needsReconciliation) return;
          const bytes = new TextEncoder().encode(
            JSON.stringify(event.data),
          ).byteLength;
          if (
            entry.bufferedEventsRef.current.length >= 2048 ||
            entry.bufferBytes + bytes > 1_048_576
          ) {
            entry.bufferedEventsRef.current = [];
            entry.needsReconciliation = true;
            return;
          }
          entry.bufferBytes += bytes;
          entry.bufferedEventsRef.current.push(event);
        },
        getPendingInputRequest: () =>
          presentationStore.getState().pendingInputRequest,
        getWorkEvents: () => presentationStore.getState().workEvents,
        cleanupSubscriptions: releaseCompletedSubscriptions,
        clearCompletionWatchdog,
        clearPendingInputRequest,
        resolvePendingInputRequest: (threadId, requestId, timestamp) => {
          const resolved = resolvePendingInputRequest(
            threadId,
            requestId,
            timestamp,
          );
          if (resolved)
            markThreadRunning(threadId, { lastActivityAt: timestamp });
          return resolved;
        },
        completeOnboardingIfNeeded,
        finalizeStream,
        isAwaitingRunIdRef: streamRuntime.isAwaitingRunIdRef,
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
        isActuallyVisible: (threadId) =>
          useAgentChatStore.getState().activeThreadId === threadId,
        touchCompletionWatchdog,
        updateActiveToolCall,
        updateThreadSummary,
      }),
    );
  };

  const sendMessage = async (
    content: string,
    sendOptions?: SendStreamMessageOptions,
  ) => {
    if (sendOptions?.signal?.aborted) {
      return;
    }

    const currentActiveThreadId = entry.activeStreamThreadRef.current;

    const preAssistantIds = collectAssistantMessageIds(
      presentationStore.getState().messages,
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
    const signal = sendOptions?.signal
      ? AbortSignal.any([sendOptions.signal, abortRef.current.signal])
      : abortRef.current.signal;
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
    // Hold every event until acceptance names this turn's run.
    streamRuntime.isAwaitingRunIdRef.current = true;
    streamRuntime.ownerGeneration += 1;
    const sendGeneration = streamRuntime.ownerGeneration;

    if (currentActiveThreadId) {
      updateThreadSummary(currentActiveThreadId, {
        attentionState: null,
        lastActivityAt: userMessage.createdAt,
        pendingInputCount: 0,
        runStatus: 'queued',
      });
    }

    presentationStore.setState((state) => ({
      stream: { ...state.stream, isStreaming: true },
    }));

    try {
      attachSubscriptions();

      const resolvedModel = model?.trim() || undefined;
      const requestPageContext = toAgentRequestPageContext(pageContext);
      const currentThread = useAgentChatStore
        .getState()
        .threads.find((item) => item.id === currentActiveThreadId);
      const clientRequestId = entry.clientRequestId;
      const startTurn = () =>
        apiService.chatStream(
          {
            artifactReferences: sendOptions?.artifactReferences,
            attachments: sendOptions?.attachments,
            brandId: sendOptions?.brandId ?? currentThread?.brandId ?? null,
            clientRequestId,
            content,
            expectedContextVersion: currentThread?.contextVersion,
            generationMode: sendOptions?.generationMode,
            generationSettings: sendOptions?.generationSettings,
            knowledgeSelection: sendOptions?.knowledgeSelection,
            model: resolvedModel,
            requestedSkillSlugs: sendOptions?.requestedSkillSlugs,
            pageContext: requestPageContext,
            agentMode: sendOptions?.agentMode,
            source: sendOptions?.source,
            threadId: currentActiveThreadId ?? undefined,
          },
          signal,
        );
      let response: AgentChatStreamResponse;
      try {
        response = await startTurn();
      } catch (error: unknown) {
        if (
          !isCurrentAgentStreamEntry(entry) ||
          entry.ownerGeneration !== sendGeneration ||
          signal.aborted ||
          !isAmbiguousAcknowledgementError(error)
        ) {
          throw error;
        }
        response = await startTurn();
      }

      const acceptedAt = response.queuedAt;

      // A handoff or adoption on another thread took the stream while this
      // send waited; its late acknowledgement must not reclaim it.
      if (
        !isCurrentAgentStreamEntry(entry) ||
        streamRuntime.ownerGeneration !== sendGeneration
      ) {
        return;
      }

      if (!entry.activeStreamThreadRef.current)
        claimProvisionalAgentEvents(
          entry,
          response.threadId,
          response.executionId,
        );
      if (!bindAgentStreamEntry(entry, response.threadId)) return;
      entry.hasProgress =
        entry.needsReconciliation ||
        entry.bufferedEventsRef.current.some(
          (event) =>
            event.threadId === response.threadId &&
            !isForeignRunEvent(event.runId, response.executionId),
        );
      presentationStore.setState({ activeThreadId: response.threadId });
      streamRuntime.activeStreamThreadRef.current = response.threadId;
      streamRuntime.activeStreamRunIdRef.current = response.executionId;
      streamRuntime.isAwaitingRunIdRef.current = false;
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
        existingThread?.mode ?? sendOptions?.agentMode,
        response.contextVersion,
        response.brandId,
      );
      setActiveRun(response.executionId, {
        startedAt: acceptedAt,
        status: 'running',
      });
      markThreadRunning(response.threadId, {
        lastActivityAt: acceptedAt,
        runStatus: 'running',
      });
      if (!entry.hasProgress) {
        const organizationId = existingThread?.organizationId ?? '';
        presentationStore.setState((state) => ({
          stream: {
            ...state.stream,
            acceptedReceipt: state.stream.acceptedReceipt ?? {
              organizationId,
              userId: '',
              threadId: response.threadId,
              runId: response.executionId,
              clientRequestId: entry.clientRequestId,
              acceptedAt,
            },
          },
        }));
      }
      scheduleCompletionWatchdog();
      // Replay last: a buffered input request, `done`, or error owns the
      // final run state instead of being overwritten by "running".
      flushBufferedEvents(response.threadId);
    } catch (err) {
      // A replaced owner must not mutate the current run or its sidebar,
      // including when the replacement belongs to the same thread.
      if (
        !isCurrentAgentStreamEntry(entry) ||
        streamRuntime.ownerGeneration !== sendGeneration
      ) {
        return;
      }
      if (signal.aborted) {
        // Nothing will name this turn's run, so stop holding events for it —
        // unless a newer send already owns the runtime.
        if (
          isCurrentAgentStreamEntry(entry) &&
          streamRuntime.ownerGeneration === sendGeneration &&
          streamRuntime.isAwaitingRunIdRef.current
        ) {
          streamRuntime.pendingCompletionRef.current = null;
          clearCompletionWatchdog();
          resetStreamState();
          releaseCompletedSubscriptions();
          if (currentActiveThreadId) {
            updateThreadSummary(currentActiveThreadId, {
              attentionState: null,
              runStatus: 'idle',
            });
          }
        }
        return;
      }

      if (currentActiveThreadId) {
        updateThreadSummary(currentActiveThreadId, {
          attentionState: null,
          lastActivityAt: new Date().toISOString(),
          runStatus: 'failed',
        });
      }

      streamRuntime.pendingCompletionRef.current = null;
      clearCompletionWatchdog();
      setError(serializeAgentError(err));
      setActiveRunStatus('failed');
      resetStreamState();
      releaseCompletedSubscriptions();
    }
  };

  // Answering an input request continues on a new execution. Hold the thread's
  // events from the moment the answer is posted, then pin the stream to the
  // execution the server names so its events are not dropped as foreign.
  const beginRunHandoff = (threadId: string): AgentRunHandoff => {
    if (useAgentChatStore.getState().activeThreadId === threadId) {
      const visible = useAgentChatStore.getState();
      presentationStore.setState({
        pendingInputRequest: visible.pendingInputRequest,
        messages: visible.messages,
        stream: visible.stream,
      });
    }
    entry.terminalAt = null;
    streamRuntime.ownerGeneration += 1;
    const handoff: AgentRunHandoff = {
      owner: entry,
      generation: streamRuntime.ownerGeneration,
      preAssistantIds: collectAssistantMessageIds(
        presentationStore.getState().messages,
      ),
      previousPending: streamRuntime.pendingCompletionRef.current,
      previousRunId:
        streamRuntime.activeStreamRunIdRef.current ??
        presentationStore.getState().activeRunId,
      threadId,
    };
    // The asking run's watchdog must not recover (and so complete) the
    // thread while its continuation is being handed over.
    streamRuntime.pendingCompletionRef.current = null;
    clearCompletionWatchdog();
    streamRuntime.activeStreamThreadRef.current = threadId;
    streamRuntime.activeStreamRunIdRef.current = null;
    streamRuntime.isAwaitingRunIdRef.current = true;
    if (streamRuntime.unsubscribersRef.current.length === 0) {
      attachSubscriptions();
    }
    return handoff;
  };

  const adoptRun = (
    handoff: AgentRunHandoff,
    runId: string,
    startedAt: string | null,
  ) => {
    // A later send, handoff, or adoption owns the stream now.
    if (
      !isCurrentAgentStreamEntry(entry) ||
      streamRuntime.ownerGeneration !== handoff.generation
    ) {
      return;
    }

    const { threadId } = handoff;
    streamRuntime.activeStreamThreadRef.current = threadId;
    streamRuntime.activeStreamRunIdRef.current = runId;
    streamRuntime.isAwaitingRunIdRef.current = false;
    if (streamRuntime.unsubscribersRef.current.length === 0) {
      attachSubscriptions();
    }
    streamRuntime.pendingCompletionRef.current = {
      initiatedAt: Date.now(),
      preAssistantIds: handoff.preAssistantIds,
      runId,
      startedAt,
      threadId,
    };
    if (isThreadVisible(threadId)) {
      setActiveRun(runId, { startedAt, status: 'running' });
      markStreamLive();
    }
    markThreadRunning(threadId, {
      lastActivityAt: startedAt ?? new Date().toISOString(),
      runStatus: 'running',
    });
    scheduleCompletionWatchdog();
    flushBufferedEvents(threadId);
  };

  const cancelRunHandoff = (
    handoff: AgentRunHandoff,
    failedRequest?: AgentInputRequest,
  ) => {
    if (
      !isCurrentAgentStreamEntry(entry) ||
      streamRuntime.ownerGeneration !== handoff.generation
    ) {
      return;
    }

    streamRuntime.isAwaitingRunIdRef.current = false;
    if (
      failedRequest &&
      isThreadVisible(handoff.threadId) &&
      !presentationStore.getState().pendingInputRequest
    ) {
      setPendingInputRequest(failedRequest);
    }
    const continuation = streamRuntime.bufferedEventsRef.current.findLast(
      (event) =>
        event.threadId === handoff.threadId &&
        event.runId &&
        failedRequest &&
        event.resolvedInputRequestId === failedRequest.inputRequestId &&
        event.runId !== failedRequest.runId,
    );
    if (continuation?.runId) {
      if (failedRequest && isThreadVisible(handoff.threadId)) {
        clearPendingInputRequest(failedRequest.inputRequestId);
      }
      adoptRun(handoff, continuation.runId, null);
      return;
    }

    // Uncorrelated run ids cannot prove that this answer was accepted.
    // Release only this handoff's events; other threads retain their buffer.
    streamRuntime.pendingCompletionRef.current = null;
    clearCompletionWatchdog();
    if (failedRequest) {
      cleanupSubscriptions(true);
    } else {
      // No failed request and no continuation: nothing is pending for this
      // handoff, so settle the entry (sets terminalAt) instead of leaving it
      // "live" — otherwise thread-switch hydration and the reconnect
      // recovery sweep keep treating it as an active local run.
      releaseCompletedSubscriptions();
    }

    if (failedRequest)
      updateThreadSummary(handoff.threadId, {
        runStatus: 'waiting_input',
        pendingInputCount: 1,
        attentionState: 'needs-input',
      });
    if (isThreadVisible(handoff.threadId)) {
      const status = presentationStore.getState().activeRunStatus;
      resetStreamState();
      setActiveRunStatus(status);
    } else {
      if (!failedRequest) return;
      const thread = useAgentChatStore
        .getState()
        .threads.find((item) => item.id === handoff.threadId);
      if (
        !thread?.runStatus ||
        !['completed', 'failed', 'cancelled'].includes(thread.runStatus)
      ) {
        updateThreadSummary(handoff.threadId, {
          runStatus: 'waiting_input',
          pendingInputCount: 1,
          attentionState: 'needs-input',
        });
      }
    }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    streamRuntime.pendingCompletionRef.current = null;
    clearCompletionWatchdog();
    cleanupSubscriptions();
    resetStreamState();
    clearMessages();
  };

  entry.recover = () => {
    const pending = entry.pendingCompletionRef.current;
    if (!pending) return;
    if (!entry.needsReconciliation) {
      void resolveStreamFromMessages(pending);
      return;
    }
    const generation = entry.ownerGeneration;
    const revision = entry.revision;
    void Promise.all([
      apiService.getThreadSnapshot(pending.threadId),
      apiService.getMessages(pending.threadId, { limit: 100 }),
    ])
      .then(([snapshot, messages]) => {
        if (
          !isCurrentAgentStreamEntry(entry) ||
          entry.ownerGeneration !== generation ||
          entry.pendingCompletionRef.current !== pending
        )
          return;
        if (entry.revision !== revision) {
          scheduleCompletionWatchdog();
          return;
        }
        const status = mapSnapshotRunStatus(snapshot.activeRun?.status);
        if (
          snapshot.activeRun?.runId &&
          snapshot.activeRun.runId !== pending.runId
        ) {
          scheduleCompletionWatchdog();
          return;
        }
        entry.needsReconciliation = false;
        presentationStore.setState({
          messages,
          messagesCursor: null,
          hasMoreMessages: false,
          isLoadingOlderMessages: false,
          pendingInputRequest: mapSnapshotPendingInputRequest(snapshot),
          workEvents: mapSnapshotWorkEvents(snapshot),
          activeRunId: snapshot.activeRun?.runId ?? pending.runId,
          activeRunStatus: status,
          runStartedAt: snapshot.activeRun?.startedAt ?? null,
          error: readSnapshotRunError(snapshot),
          stream: {
            ...presentationStore.getState().stream,
            isStreaming: status === 'running',
            streamingContent: '',
            streamingReasoning: '',
          },
        });
        updateThreadSummary(
          pending.threadId,
          buildThreadSummaryFromSnapshot(snapshot, {
            isVisible:
              useAgentChatStore.getState().activeThreadId === pending.threadId,
          }),
        );
        if (status === 'running') scheduleCompletionWatchdog();
        else if (presentationStore.getState().pendingInputRequest)
          clearCompletionWatchdog();
        else releaseCompletedSubscriptions();
      })
      .catch(() => {
        if (
          isCurrentAgentStreamEntry(entry) &&
          entry.ownerGeneration === generation &&
          entry.pendingCompletionRef.current === pending
        )
          scheduleCompletionWatchdog();
      });
  };
  if (
    presentationStore.getState().stream.isStreaming &&
    entry.activeStreamThreadRef.current
  ) {
    entry.activeStreamRunIdRef.current =
      presentationStore.getState().activeRunId;
    entry.pendingCompletionRef.current = {
      initiatedAt: Date.now(),
      preAssistantIds: collectAssistantMessageIds(
        presentationStore.getState().messages,
      ),
      runId: entry.activeStreamRunIdRef.current,
      startedAt: presentationStore.getState().runStartedAt,
      threadId: entry.activeStreamThreadRef.current,
    };
    attachSubscriptions();
    markThreadRunning(entry.activeStreamThreadRef.current);
    scheduleCompletionWatchdog();
  }
  return {
    adoptRun,
    beginRunHandoff,
    cancelRunHandoff,
    clearChat,
    isStreaming,
    sendMessage,
  };
}
