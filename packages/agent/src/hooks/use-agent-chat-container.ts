import type { ExtractedMention } from '@genfeedai/agent/components/AgentChatInput';
import { mapRunStatusToClientStatus } from '@genfeedai/agent/components/agent-workspace-run.helpers';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { handleAgentUiAction } from '@genfeedai/agent/hooks/agent-chat-container.ui-actions';
import { useAgentChat } from '@genfeedai/agent/hooks/use-agent-chat';
import { useAgentChatStream } from '@genfeedai/agent/hooks/use-agent-chat-stream';
import type {
  AgentChatMessage as AgentChatMessageType,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type {
  ConversationComposerSendOptions,
  PersistedConversationComposerAttachment,
} from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  readConversationComposerDraft,
  writeConversationComposerAttachments,
} from '@genfeedai/agent/stores/conversation-composer-draft.store';
import {
  computeStableTimelineEntries,
  EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
  type StableTimelineEntriesState,
} from '@genfeedai/agent/utils/compute-stable-timeline-entries';
import {
  composeTimelineWithStream,
  deriveHistoricalTimeline,
} from '@genfeedai/agent/utils/derive-timeline';
import { resolveRetryPrompt } from '@genfeedai/agent/utils/resolve-retry-prompt';
import type {
  AttachmentItem,
  ChatAttachment,
} from '@genfeedai/props/ui/attachments.props';
import { useAttachments } from '@hooks/ui/use-attachments/use-attachments';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseAgentChatContainerParams {
  apiService: AgentApiService;
  isLoadingThread: boolean;
  isReadOnly: boolean;
  isStreaming: boolean;
  model?: string;
  onOnboardingCompleted?: () => void | Promise<void>;
  onCopy?: (content: string) => void | Promise<void>;
  onRegenerate?: (message: AgentChatMessageType) => void | Promise<void>;
  onCreateFollowUpTasks?: (taskId: string) => Promise<{ createdCount: number }>;
  onSelectIngredient?: (ingredient: { id: string; title?: string }) => void;
  workspacePlanningTaskId?: string | null;
}

function restoreComposerAttachments(
  attachments: PersistedConversationComposerAttachment[],
): AttachmentItem[] {
  return attachments.map((attachment) => {
    const wasInterrupted =
      attachment.status === 'pending' || attachment.status === 'uploading';

    return {
      ...attachment,
      error: wasInterrupted
        ? 'Upload was interrupted. Reattach this file to retry.'
        : attachment.error,
      previewUrl: attachment.previewUrl ?? attachment.url ?? '',
      status: wasInterrupted ? 'failed' : attachment.status,
    };
  });
}

function persistableComposerAttachments(
  attachments: AttachmentItem[],
): PersistedConversationComposerAttachment[] {
  return attachments.map((attachment) => ({
    error: attachment.error,
    id: attachment.id,
    ingredientId: attachment.ingredientId,
    kind: attachment.kind,
    name: attachment.name,
    previewUrl: attachment.previewUrl.startsWith('blob:')
      ? attachment.url
      : attachment.previewUrl,
    progress: attachment.progress,
    status: attachment.status,
    url: attachment.url,
  }));
}

export function useAgentChatContainer({
  apiService,
  isLoadingThread,
  isReadOnly,
  isStreaming,
  model,
  onOnboardingCompleted,
  onCopy,
  onRegenerate,
  onCreateFollowUpTasks,
  onSelectIngredient: onSelectIngredientProp,
  workspacePlanningTaskId,
}: UseAgentChatContainerParams) {
  const composerShell = useConversationComposerShell();
  const draftScopeKey = composerShell?.draftScopeKey ?? null;
  const initialComposerAttachments = useMemo(
    () =>
      restoreComposerAttachments(
        readConversationComposerDraft(draftScopeKey).attachments,
      ),
    [draftScopeKey],
  );
  const handleComposerAttachmentsChange = useCallback(
    (attachments: AttachmentItem[]) => {
      writeConversationComposerAttachments(
        draftScopeKey,
        persistableComposerAttachments(attachments),
      );
    },
    [draftScopeKey],
  );
  const addMessage = useAgentChatStore((s) => s.addMessage);
  const messages = useAgentChatStore((s) => s.messages);
  const isGenerating = useAgentChatStore((s) => s.isGenerating);
  const error = useAgentChatStore((s) => s.error);
  const setError = useAgentChatStore((s) => s.setError);
  const setCreditsRemaining = useAgentChatStore((s) => s.setCreditsRemaining);
  const streamState = useAgentChatStore((s) => s.stream);
  const threads = useAgentChatStore((s) => s.threads);
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const activeRunId = useAgentChatStore((s) => s.activeRunId);
  const activeRunStatus = useAgentChatStore((s) => s.activeRunStatus);
  const addWorkEvent = useAgentChatStore((s) => s.addWorkEvent);
  const clearPendingInputRequest = useAgentChatStore(
    (s) => s.clearPendingInputRequest,
  );
  const draftPlanModeEnabled = useAgentChatStore((s) => s.draftPlanModeEnabled);
  const latestProposedPlan = useAgentChatStore((s) => s.latestProposedPlan);
  const onboardingSignupGiftCredits = useAgentChatStore(
    (s) => s.onboardingSignupGiftCredits,
  );
  const onboardingTotalJourneyCredits = useAgentChatStore(
    (s) => s.onboardingTotalJourneyCredits,
  );
  const pendingInputRequest = useAgentChatStore((s) => s.pendingInputRequest);
  const runStartedAt = useAgentChatStore((s) => s.runStartedAt);
  const setActiveRun = useAgentChatStore((s) => s.setActiveRun);
  const setActiveRunStatus = useAgentChatStore((s) => s.setActiveRunStatus);
  const workEvents = useAgentChatStore((s) => s.workEvents);
  const socketConnectionState = useAgentChatStore(
    (s) => s.socketConnectionState,
  );
  const setActiveThread = useAgentChatStore((s) => s.setActiveThread);
  const setDraftPlanModeEnabled = useAgentChatStore(
    (s) => s.setDraftPlanModeEnabled,
  );
  const setLatestProposedPlan = useAgentChatStore(
    (s) => s.setLatestProposedPlan,
  );
  const updateThread = useAgentChatStore((s) => s.updateThread);
  const upsertThread = useAgentChatStore((s) => s.upsertThread);

  const { sendMessage: sendNonStreaming } = useAgentChat({
    apiService,
    model,
    onOnboardingCompleted,
  });
  const { sendMessage: sendStreaming, isStreaming: isStreamingActive } =
    useAgentChatStream({
      apiService,
      model,
      onOnboardingCompleted,
    });

  const sendMessage = isStreaming ? sendStreaming : sendNonStreaming;
  const isBusy = isGenerating || (isStreaming && isStreamingActive);

  const {
    attachments: chatAttachments,
    isUploading: isAttachmentUploading,
    dragState,
    addFiles,
    removeAttachment,
    clearAll: clearAllAttachments,
    getCompletedAttachments,
    dragHandlers,
  } = useAttachments({
    acceptedTypes: ['image/*', 'video/*', 'audio/*'],
    initialAttachments: initialComposerAttachments,
    onAttachmentsChange: handleComposerAttachmentsChange,
    onUpload: (file, onProgress) =>
      runAgentApiEffect(apiService.uploadAttachmentEffect(file, onProgress)),
  });
  const previousDraftScopeKeyRef = useRef(draftScopeKey);
  useEffect(() => {
    const previousDraftScopeKey = previousDraftScopeKeyRef.current;
    if (previousDraftScopeKey === draftScopeKey) {
      return;
    }

    previousDraftScopeKeyRef.current = draftScopeKey;
    const previousVersionSeparator = previousDraftScopeKey?.lastIndexOf(':');
    const nextVersionSeparator = draftScopeKey?.lastIndexOf(':');
    const isSameThreadScope =
      previousVersionSeparator !== undefined &&
      previousVersionSeparator >= 0 &&
      nextVersionSeparator !== undefined &&
      nextVersionSeparator >= 0 &&
      previousDraftScopeKey?.slice(0, previousVersionSeparator) ===
        draftScopeKey?.slice(0, nextVersionSeparator);

    if (isSameThreadScope) {
      clearAllAttachments();
    }
  }, [clearAllAttachments, draftScopeKey]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasLoadingThreadRef = useRef(isLoadingThread);
  const scrolledThreadIdRef = useRef<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [elapsedNow, setElapsedNow] = useState(() => Date.now());
  const [isSubmittingInputRequest, setIsSubmittingInputRequest] =
    useState(false);
  const [activeUiAction, setActiveUiAction] = useState<string | null>(null);
  const [isCreatingFollowUpTasks, setIsCreatingFollowUpTasks] = useState(false);
  const [followUpTaskMessage, setFollowUpTaskMessage] = useState<string | null>(
    null,
  );

  const isRunActive =
    activeRunStatus === 'running' || activeRunStatus === 'cancelling';

  const activeThreadTitle = useMemo(() => {
    if (!activeThreadId) {
      return null;
    }

    const matchingThread = threads.find(
      (thread) => thread.id === activeThreadId,
    );
    const normalizedTitle = matchingThread?.title?.trim();

    return normalizedTitle && normalizedTitle.length > 0
      ? normalizedTitle
      : null;
  }, [activeThreadId, threads]);

  const runDurationLabel = useMemo(() => {
    if (!runStartedAt || !isRunActive) {
      return null;
    }

    const startedAtMs = new Date(runStartedAt).getTime();
    if (Number.isNaN(startedAtMs)) {
      return null;
    }

    const elapsedMs = Math.max(0, elapsedNow - startedAtMs);
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) {
      return `${seconds}s`;
    }

    return `${minutes}m ${seconds}s`;
  }, [elapsedNow, isRunActive, runStartedAt]);

  // Historical entries depend only on `messages` + `workEvents`, never on
  // `streamState` — so streamed tokens (which mutate `streamState` on every
  // chunk) no longer force this memo, or anything downstream of it, to
  // recompute. See packages/agent/src/utils/derive-timeline.ts.
  const historicalTimeline = useMemo(
    () =>
      deriveHistoricalTimeline(messages, workEvents, streamState.isStreaming),
    [messages, workEvents, streamState.isStreaming],
  );

  // `deriveHistoricalTimeline` rebuilds every entry object on each call, so
  // even with the memo above scoped correctly, a genuine `messages`/
  // `workEvents` change still produces a brand-new array of brand-new
  // objects. Structural sharing reuses the previous entry reference for any
  // entry whose content did not actually change, so memoized row components
  // downstream (`AgentChatMessage`, `TimelineWorkGroup`) can bail out via
  // `React.memo` instead of re-rendering the entire history.
  const stableTimelineEntriesRef = useRef<StableTimelineEntriesState>(
    EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
  );
  const stableHistoricalEntries = useMemo(() => {
    const nextState = computeStableTimelineEntries(
      stableTimelineEntriesRef.current,
      historicalTimeline.entries,
    );
    stableTimelineEntriesRef.current = nextState;
    return nextState.result;
  }, [historicalTimeline.entries]);

  const timeline = useMemo(
    () =>
      composeTimelineWithStream(
        {
          activeEvents: historicalTimeline.activeEvents,
          entries: stableHistoricalEntries,
        },
        streamState,
        runDurationLabel,
      ),
    [
      historicalTimeline.activeEvents,
      stableHistoricalEntries,
      streamState,
      runDurationLabel,
    ],
  );

  const followLatestTurn = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      setIsAtBottom(true);

      if (typeof window === 'undefined') {
        messagesEndRef.current?.scrollIntoView({ behavior });
        return;
      }

      window.requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior });
      });
    },
    [],
  );

  const togglePlanMode = useCallback(
    async (enabled: boolean) => {
      setDraftPlanModeEnabled(enabled);

      if (!activeThreadId) {
        return;
      }

      updateThread(activeThreadId, { planModeEnabled: enabled });

      try {
        await runAgentApiEffect(
          apiService.updateThreadEffect(activeThreadId, {
            planModeEnabled: enabled,
          }),
        );
      } catch {
        updateThread(activeThreadId, { planModeEnabled: !enabled });
        setDraftPlanModeEnabled(!enabled);
        setError('Failed to update plan mode for this thread.');
      }
    },
    [
      activeThreadId,
      apiService,
      setDraftPlanModeEnabled,
      setError,
      updateThread,
    ],
  );

  const handleSend = useCallback(
    (
      content: string,
      _mentions?: ExtractedMention[],
      attachments?: ChatAttachment[],
      options?: ConversationComposerSendOptions,
    ) => {
      if (isReadOnly) {
        setError('Archived threads are read-only.');
        return;
      }
      followLatestTurn('smooth');
      sendMessage(content, {
        artifactReferences: options?.artifactReferences,
        attachments,
        ...(options?.brandId ? { brandId: options.brandId } : {}),
        planModeEnabled: options?.planModeEnabled ?? false,
      });
    },
    [followLatestTurn, isReadOnly, sendMessage, setError],
  );

  const handleIngredientSelect = useCallback(
    (ingredient: { id: string; title?: string }) => {
      if (isReadOnly) {
        setError('Archived threads are read-only.');
        return;
      }
      const label = ingredient.title
        ? `${ingredient.id} (${ingredient.title})`
        : ingredient.id;
      followLatestTurn('smooth');
      sendMessage(`Selected ingredient: ${label}`);
      onSelectIngredientProp?.(ingredient);
    },
    [
      followLatestTurn,
      isReadOnly,
      sendMessage,
      onSelectIngredientProp,
      setError,
    ],
  );

  const handleCopy = useCallback(
    async (content: string) => {
      if (!content.trim()) {
        return;
      }

      try {
        if (onCopy) {
          await onCopy(content);
          return;
        }

        await navigator.clipboard.writeText(content);
      } catch {
        setError('Failed to copy content to clipboard.');
      }
    },
    [onCopy, setError],
  );

  const handleRetry = useCallback(
    async (message: AgentChatMessageType) => {
      if (isBusy) {
        return;
      }

      try {
        if (onRegenerate) {
          followLatestTurn('smooth');
          await onRegenerate(message);
          return;
        }

        const retryPrompt = resolveRetryPrompt(messages, message.id);
        if (!retryPrompt) {
          setError('Unable to retry: no previous user prompt found.');
          return;
        }

        followLatestTurn('smooth');
        sendMessage(retryPrompt);
      } catch {
        setError('Failed to retry this message.');
      }
    },
    [followLatestTurn, isBusy, messages, onRegenerate, sendMessage, setError],
  );

  const handleStopRun = useCallback(async () => {
    if (!activeRunId || activeRunStatus === 'cancelling') {
      return;
    }

    setActiveRunStatus('cancelling');

    try {
      await runAgentApiEffect(apiService.cancelRunEffect(activeRunId));
    } catch {
      setActiveRunStatus('failed');
      setError('Failed to stop the active agent run.');
    }
  }, [activeRunId, activeRunStatus, apiService, setActiveRunStatus, setError]);

  const handleSubmitInputRequest = useCallback(
    async (answer: string) => {
      const normalizedAnswer = answer.trim();
      const request = pendingInputRequest;
      if (!normalizedAnswer || !request) {
        return;
      }

      setIsSubmittingInputRequest(true);
      try {
        const workEventId = `input-resolved-${request.inputRequestId}`;
        addWorkEvent({
          createdAt: new Date().toISOString(),
          detail: normalizedAnswer,
          event: AgentWorkEventType.INPUT_SUBMITTED,
          id: workEventId,
          inputRequestId: request.inputRequestId,
          label: 'User input submitted',
          runId: request.runId,
          status: AgentWorkEventStatus.COMPLETED,
          threadId: request.threadId,
        } satisfies AgentWorkEvent);
        await runAgentApiEffect(
          apiService.respondToInputRequestEffect(
            request.threadId,
            request.inputRequestId,
            normalizedAnswer,
            undefined,
            (() => {
              const thread = threads.find(
                (item) => item.id === request.threadId,
              );
              return {
                brandId: thread?.brandId ?? null,
                expectedContextVersion: thread?.contextVersion,
              };
            })(),
          ),
        );
        clearPendingInputRequest();
      } catch {
        addWorkEvent({
          createdAt: new Date().toISOString(),
          detail: normalizedAnswer,
          event: AgentWorkEventType.INPUT_SUBMITTED,
          id: `input-resolved-${request.inputRequestId}`,
          inputRequestId: request.inputRequestId,
          label: 'User input submission failed',
          runId: request.runId,
          status: AgentWorkEventStatus.FAILED,
          threadId: request.threadId,
        } satisfies AgentWorkEvent);
        setError('Failed to submit the requested input.');
      } finally {
        setIsSubmittingInputRequest(false);
      }
    },
    [
      addWorkEvent,
      apiService,
      clearPendingInputRequest,
      pendingInputRequest,
      setError,
      threads,
    ],
  );

  const handleUiAction = useCallback(
    async (action: string, payload?: Record<string, unknown>) => {
      return await handleAgentUiAction(action, payload, {
        activeThreadId,
        activeUiAction,
        addMessage,
        apiService,
        draftPlanModeEnabled,
        followLatestTurn,
        isBusy,
        isReadOnly,
        latestProposedPlan,
        sendMessage,
        setActiveThread,
        setActiveUiAction,
        setCreditsRemaining,
        setError,
        setLatestProposedPlan,
        threads,
        upsertThread,
      });
    },
    [
      activeThreadId,
      activeUiAction,
      addMessage,
      apiService,
      draftPlanModeEnabled,
      isBusy,
      isReadOnly,
      latestProposedPlan,
      followLatestTurn,
      sendMessage,
      setActiveThread,
      setCreditsRemaining,
      setError,
      setLatestProposedPlan,
      threads,
      upsertThread,
    ],
  );

  const handleApprovePlan = useCallback(async () => {
    await handleUiAction('approve_plan', {
      planId: latestProposedPlan?.id,
    });
  }, [handleUiAction, latestProposedPlan?.id]);

  const handleRequestPlanChanges = useCallback(
    async (revisionNote: string) => {
      await handleUiAction('revise_plan', {
        planId: latestProposedPlan?.id,
        revisionNote,
      });
    },
    [handleUiAction, latestProposedPlan?.id],
  );

  const handleCreateFollowUpTasks = useCallback(async () => {
    if (!workspacePlanningTaskId || !onCreateFollowUpTasks) {
      return;
    }

    setIsCreatingFollowUpTasks(true);
    setFollowUpTaskMessage(null);

    try {
      const result = await onCreateFollowUpTasks(workspacePlanningTaskId);
      const createdCount = result.createdCount ?? 0;
      setFollowUpTaskMessage(
        createdCount === 1
          ? 'Created 1 follow-up task.'
          : `Created ${createdCount} follow-up tasks.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create follow-up tasks from this plan.',
      );
    } finally {
      setIsCreatingFollowUpTasks(false);
    }
  }, [onCreateFollowUpTasks, setError, workspacePlanningTaskId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const hasRenderableThreadState =
    messages.length > 0 ||
    Boolean(latestProposedPlan) ||
    Boolean(pendingInputRequest) ||
    workEvents.length > 0 ||
    streamState.isStreaming ||
    streamState.streamingContent.length > 0 ||
    streamState.streamingReasoning.length > 0;
  const isEmpty = !hasRenderableThreadState;

  // Scroll tracking
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    function handleScroll() {
      if (!container) {
        return;
      }
      const threshold = 100;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setIsAtBottom(distanceFromBottom <= threshold);
    }

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll-to-bottom when a thread first becomes readable (imperative DOM, not
  // derived UI). A thread restored from cache paints without ever flipping
  // isLoadingThread, so keying only off the loading transition would leave the
  // switch parked at the scroll offset of the thread the user just left.
  useEffect(() => {
    if (activeThreadId === null) {
      // Leaving for the no-thread surface ends this thread's claim on the
      // scroll position. Holding the id would mean re-entering that same
      // thread from cache matches neither branch below and never scrolls.
      scrolledThreadIdRef.current = null;
      wasLoadingThreadRef.current = isLoadingThread;
      return;
    }

    const hasFinishedLoading = wasLoadingThreadRef.current && !isLoadingThread;
    const isNewlyRenderedThread =
      activeThreadId !== scrolledThreadIdRef.current;

    if (
      (hasFinishedLoading || isNewlyRenderedThread) &&
      !isLoadingThread &&
      messages.length > 0
    ) {
      scrolledThreadIdRef.current = activeThreadId;
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setIsAtBottom(true);
    }

    wasLoadingThreadRef.current = isLoadingThread;
  }, [activeThreadId, isLoadingThread, messages.length]);

  // Elapsed timer for run duration
  useEffect(() => {
    if (!isRunActive || !runStartedAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunActive, runStartedAt]);

  // Clear follow-up task message on mount
  useEffect(() => {
    setFollowUpTaskMessage(null);
  }, []);

  // Restore active run from API on thread change
  useEffect(() => {
    const controller = new AbortController();

    runAgentApiEffect(apiService.getActiveRunsEffect(controller.signal))
      .then((runs) => {
        if (controller.signal.aborted) {
          return;
        }

        const matchingRun = runs.find((run) => run.thread === activeThreadId);

        if (!matchingRun) {
          return;
        }

        setActiveRun(matchingRun.id, {
          startedAt: matchingRun.startedAt ?? null,
          status: mapRunStatusToClientStatus(matchingRun.status),
        });
      })
      .catch(() => {
        /* ignore restore failures */
      });

    return () => controller.abort();
  }, [activeThreadId, apiService, setActiveRun]);

  return {
    // store slices
    messages,
    isGenerating,
    error,
    setError,
    streamState,
    activeThreadId,
    activeRunStatus,
    draftPlanModeEnabled,
    latestProposedPlan,
    onboardingSignupGiftCredits,
    onboardingTotalJourneyCredits,
    pendingInputRequest,
    socketConnectionState,
    workEvents,
    // derived
    isBusy,
    isRunActive,
    isStreamingActive,
    isEmpty,
    activeThreadTitle,
    runDurationLabel,
    timeline,
    // local state
    isAtBottom,
    isSubmittingInputRequest,
    activeUiAction,
    isCreatingFollowUpTasks,
    followUpTaskMessage,
    // refs
    messagesEndRef,
    scrollContainerRef,
    // attachment state
    chatAttachments,
    isAttachmentUploading,
    dragState,
    addFiles,
    removeAttachment,
    clearAllAttachments,
    getCompletedAttachments,
    dragHandlers,
    // handlers
    sendMessage,
    followLatestTurn,
    togglePlanMode,
    handleSend,
    handleIngredientSelect,
    handleCopy,
    handleRetry,
    handleStopRun,
    handleSubmitInputRequest,
    handleUiAction,
    handleApprovePlan,
    handleRequestPlanChanges,
    handleCreateFollowUpTasks,
    scrollToBottom,
  };
}
