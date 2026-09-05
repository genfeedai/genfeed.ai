import type { ExtractedMention } from '@genfeedai/agent/components/AgentChatInput';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { AGENT_MESSAGE_PAGE_SIZE } from '@genfeedai/agent/constants/agent-message-pagination.constant';
import { handleAgentUiAction } from '@genfeedai/agent/hooks/agent-chat-container.ui-actions';
import { useAgentChat } from '@genfeedai/agent/hooks/use-agent-chat';
import { useAgentChatStream } from '@genfeedai/agent/hooks/use-agent-chat-stream';
import { useComposerFollowUpQueue } from '@genfeedai/agent/hooks/use-composer-follow-up-queue';
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
import { AgentApiRequestError } from '@genfeedai/agent/services/agent-api-error';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  readConversationComposerDraft,
  writeConversationComposerAttachments,
} from '@genfeedai/agent/stores/conversation-composer-draft.store';
import type { ComposerFollowUp } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import {
  computeStableTimelineEntries,
  EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
  type StableTimelineEntriesState,
} from '@genfeedai/agent/utils/compute-stable-timeline-entries';
import {
  composeTimelineWithStream,
  deriveHistoricalTimeline,
} from '@genfeedai/agent/utils/derive-timeline';
import { hasRenderableThreadState } from '@genfeedai/agent/utils/has-renderable-thread-state';
import { resolveRetryPrompt } from '@genfeedai/agent/utils/resolve-retry-prompt';
import { UploadStatus, WorkflowExecutionStatus } from '@genfeedai/contracts';
import type {
  AttachmentItem,
  ChatAttachment,
} from '@genfeedai/props/ui/attachments.props';
import { useAttachments } from '@hooks/ui/use-attachments/use-attachments';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
      attachment.status === UploadStatus.PENDING ||
      attachment.status === UploadStatus.UPLOADING;

    return {
      ...attachment,
      error: wasInterrupted
        ? 'Upload was interrupted. Reattach this file to retry.'
        : attachment.error,
      previewUrl: attachment.previewUrl ?? attachment.url ?? '',
      status: wasInterrupted ? UploadStatus.FAILED : attachment.status,
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
  const hasMoreMessages = useAgentChatStore((s) => s.hasMoreMessages);
  const messagesCursor = useAgentChatStore((s) => s.messagesCursor);
  const isLoadingOlderMessages = useAgentChatStore(
    (s) => s.isLoadingOlderMessages,
  );
  const prependOlderMessages = useAgentChatStore((s) => s.prependOlderMessages);
  const setIsLoadingOlderMessages = useAgentChatStore(
    (s) => s.setIsLoadingOlderMessages,
  );
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
  const clearStaleActiveRun = useAgentChatStore((s) => s.clearStaleActiveRun);
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
  const isTransportBusy = isGenerating || (isStreaming && isStreamingActive);

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
      apiService.uploadAttachment(file, onProgress),
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
  const olderMessagesRequestEpochRef = useRef(0);
  const olderMessagesRequestInFlightRef = useRef(false);
  const olderMessagesAbortControllerRef = useRef<AbortController | null>(null);
  const activeThreadIdRef = useRef(activeThreadId);
  const messagesCursorRef = useRef(messagesCursor);
  const pendingScrollAnchorRef = useRef<{
    container: HTMLDivElement;
    expectedMessageCount: number;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const wasLoadingThreadRef = useRef(isLoadingThread);
  const scrolledThreadIdRef = useRef<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [elapsedNow, setElapsedNow] = useState(() => Date.now());
  const [isSubmittingInputRequest, setIsSubmittingInputRequest] =
    useState(false);
  const activeUiActionRef = useRef<string | null>(null);
  const submitInputRequestRef = useRef<(answer: string) => Promise<void>>(
    async () => undefined,
  );
  const [activeUiAction, setActiveUiActionState] = useState<string | null>(
    null,
  );
  const setActiveUiAction = useCallback((action: string | null) => {
    activeUiActionRef.current = action;
    setActiveUiActionState(action);
  }, []);
  const isBusy = isTransportBusy || Boolean(activeUiAction);
  const [isCreatingFollowUpTasks, setIsCreatingFollowUpTasks] = useState(false);
  const [followUpTaskMessage, setFollowUpTaskMessage] = useState<string | null>(
    null,
  );

  activeThreadIdRef.current = activeThreadId;
  messagesCursorRef.current = messagesCursor;

  const isRunActive =
    activeRunStatus === 'running' || activeRunStatus === 'cancelling';
  const canAutoDispatchFollowUps = !isBusy && !error;

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

  const handleStopRun = useCallback(async (): Promise<boolean> => {
    if (
      !isBusy &&
      activeRunStatus !== 'running' &&
      activeRunStatus !== 'cancelling'
    ) {
      return true;
    }

    if (activeRunStatus === 'cancelling') {
      return true;
    }

    if (!activeRunId) {
      return false;
    }

    setActiveRunStatus('cancelling');

    try {
      await apiService.cancelWorkflowExecution(activeRunId);
      return true;
    } catch (error) {
      if (error instanceof AgentApiRequestError && error.status === 404) {
        clearStaleActiveRun();
        return true;
      }
      setActiveRunStatus('failed');
      setError('Failed to stop the active agent run.');
      return false;
    }
  }, [
    activeRunId,
    activeRunStatus,
    apiService,
    clearStaleActiveRun,
    isBusy,
    setActiveRunStatus,
    setError,
  ]);

  const flushFollowUp = useCallback(
    async (item: ComposerFollowUp): Promise<boolean> => {
      if (isReadOnly) {
        setError('Archived threads are read-only.');
        return false;
      }

      try {
        followLatestTurn('smooth');
        await sendMessage(item.content, {
          artifactReferences: item.options?.artifactReferences,
          attachments: item.attachments,
          ...(item.options?.brandId ? { brandId: item.options.brandId } : {}),
          generationMode: item.options?.generationMode,
          generationSettings: item.options?.generationSettings,
          planModeEnabled: item.options?.planModeEnabled ?? false,
        });
        return true;
      } catch {
        return false;
      }
    },
    [followLatestTurn, isReadOnly, sendMessage, setError],
  );

  const followUpQueue = useComposerFollowUpQueue({
    canAutoDispatch: canAutoDispatchFollowUps,
    isBusy,
    isReadOnly,
    onDispatch: flushFollowUp,
    onInterrupt: handleStopRun,
    threadId: activeThreadId,
  });

  const togglePlanMode = useCallback(
    async (enabled: boolean) => {
      setDraftPlanModeEnabled(enabled);

      if (!activeThreadId) {
        return;
      }

      updateThread(activeThreadId, { planModeEnabled: enabled });

      try {
        await apiService.updateThread(activeThreadId, {
          planModeEnabled: enabled,
        });
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
      mentions?: ExtractedMention[],
      attachments?: ChatAttachment[],
      options?: ConversationComposerSendOptions,
    ): boolean => {
      if (isReadOnly) {
        setError('Archived threads are read-only.');
        return false;
      }
      const liveState = useAgentChatStore.getState();
      const shouldQueueFollowUp =
        Boolean(activeUiActionRef.current) ||
        liveState.isGenerating ||
        (isStreaming && liveState.stream.isStreaming);

      const pendingAsk = liveState.pendingInputRequest;
      if (pendingAsk && !shouldQueueFollowUp) {
        const answer = content.trim();
        if (answer) {
          followLatestTurn('smooth');
          void submitInputRequestRef.current(answer);
          return true;
        }
      }

      if (shouldQueueFollowUp) {
        const enqueued = followUpQueue.enqueue(content, {
          attachments,
          mentions,
          options: {
            artifactReferences: options?.artifactReferences,
            ...(options?.brandId ? { brandId: options.brandId } : {}),
            generationMode: options?.generationMode,
            generationSettings: options?.generationSettings,
            planModeEnabled: options?.planModeEnabled ?? false,
          },
        });
        if (!enqueued.accepted) {
          return false;
        }
        return true;
      }
      followLatestTurn('smooth');
      void sendMessage(content, {
        artifactReferences: options?.artifactReferences,
        attachments,
        ...(options?.brandId ? { brandId: options.brandId } : {}),
        generationMode: options?.generationMode,
        generationSettings: options?.generationSettings,
        planModeEnabled: options?.planModeEnabled ?? false,
      });
      return true;
    },
    [
      followLatestTurn,
      followUpQueue,
      isReadOnly,
      isStreaming,
      sendMessage,
      setError,
    ],
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
      handleSend(`Selected ingredient: ${label}`);
      onSelectIngredientProp?.(ingredient);
    },
    [handleSend, isReadOnly, onSelectIngredientProp, setError],
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
      try {
        if (onRegenerate) {
          if (isBusy) {
            return;
          }
          followLatestTurn('smooth');
          await onRegenerate(message);
          return;
        }

        const retryPrompt = resolveRetryPrompt(messages, message.id);
        if (!retryPrompt) {
          setError('Unable to retry: no previous user prompt found.');
          return;
        }

        handleSend(retryPrompt);
      } catch {
        setError('Failed to retry this message.');
      }
    },
    [followLatestTurn, handleSend, isBusy, messages, onRegenerate, setError],
  );

  const sendFollowUpNow = followUpQueue.sendNow;

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
        await apiService.respondToInputRequest(
          request.threadId,
          request.inputRequestId,
          normalizedAnswer,
          undefined,
          (() => {
            const thread = threads.find((item) => item.id === request.threadId);
            return {
              brandId: thread?.brandId ?? null,
              expectedContextVersion: thread?.contextVersion,
            };
          })(),
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
  submitInputRequestRef.current = handleSubmitInputRequest;

  const handleUiAction = useCallback(
    async (action: string, payload?: Record<string, unknown>) => {
      return await handleAgentUiAction(action, payload, {
        activeThreadId,
        activeUiAction: activeUiActionRef.current,
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
      addMessage,
      apiService,
      draftPlanModeEnabled,
      isBusy,
      isReadOnly,
      latestProposedPlan,
      followLatestTurn,
      sendMessage,
      setActiveThread,
      setActiveUiAction,
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

  const loadOlderMessages = useCallback(async () => {
    const threadId = activeThreadId;
    const cursor = messagesCursor;
    if (
      !threadId ||
      !cursor ||
      !hasMoreMessages ||
      isLoadingOlderMessages ||
      olderMessagesRequestInFlightRef.current
    ) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    olderMessagesRequestInFlightRef.current = true;
    setIsLoadingOlderMessages(true);
    const requestEpoch = ++olderMessagesRequestEpochRef.current;
    const controller = new AbortController();
    olderMessagesAbortControllerRef.current = controller;

    try {
      const page = await apiService.getMessagesPage(
        threadId,
        { cursor, limit: AGENT_MESSAGE_PAGE_SIZE },
        controller.signal,
      );

      if (
        controller.signal.aborted ||
        requestEpoch !== olderMessagesRequestEpochRef.current ||
        activeThreadIdRef.current !== threadId ||
        messagesCursorRef.current !== cursor
      ) {
        return;
      }

      const currentMessageIds = new Set(messages.map((message) => message.id));
      const olderMessageCount = page.messages.filter(
        (message) => !currentMessageIds.has(message.id),
      ).length;
      pendingScrollAnchorRef.current =
        olderMessageCount > 0
          ? {
              container,
              expectedMessageCount: messages.length + olderMessageCount,
              scrollHeight: container.scrollHeight,
              scrollTop: container.scrollTop,
            }
          : null;
      prependOlderMessages(page);
    } catch {
      if (!controller.signal.aborted) {
        setError('Failed to load older messages. Try scrolling up again.');
      }
    } finally {
      if (requestEpoch === olderMessagesRequestEpochRef.current) {
        olderMessagesRequestInFlightRef.current = false;
        olderMessagesAbortControllerRef.current = null;
        setIsLoadingOlderMessages(false);
      }
    }
  }, [
    activeThreadId,
    apiService,
    hasMoreMessages,
    isLoadingOlderMessages,
    messages,
    messagesCursor,
    prependOlderMessages,
    setError,
    setIsLoadingOlderMessages,
  ]);

  useLayoutEffect(() => {
    const anchor = pendingScrollAnchorRef.current;
    if (!anchor || messages.length < anchor.expectedMessageCount) {
      return;
    }

    pendingScrollAnchorRef.current = null;
    anchor.container.scrollTop =
      anchor.scrollTop + (anchor.container.scrollHeight - anchor.scrollHeight);
  }, [messages.length]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
    olderMessagesRequestEpochRef.current += 1;
    olderMessagesRequestInFlightRef.current = false;
    olderMessagesAbortControllerRef.current?.abort();
    olderMessagesAbortControllerRef.current = null;
    pendingScrollAnchorRef.current = null;
  }, [activeThreadId]);

  useEffect(() => {
    return () => {
      olderMessagesRequestEpochRef.current += 1;
      olderMessagesAbortControllerRef.current?.abort();
    };
  }, []);

  const isEmpty = !hasRenderableThreadState({
    hasLatestProposedPlan: Boolean(latestProposedPlan),
    hasPendingInputRequest: Boolean(pendingInputRequest),
    isStreaming: streamState.isStreaming,
    messageCount: messages.length,
    pendingUiActionCount: streamState.pendingUiActions.length,
    streamingContentLength: streamState.streamingContent.length,
    streamingReasoningLength: streamState.streamingReasoning.length,
    workEventCount: workEvents.length,
  });

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
      if (container.scrollTop <= threshold) {
        void loadOlderMessages();
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [loadOlderMessages]);

  // Stick-to-bottom: while the user is pinned to the bottom, every streamed
  // token, tool transition, work event, or new message re-pins the viewport.
  // Scrolling up (isAtBottom=false) releases the pin until the user returns.
  // Older-message prepends only happen near the top, so they never re-pin.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the stream/timeline values are intentional re-pin triggers; the body only reads refs
  useEffect(() => {
    if (!isAtBottom) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [
    isAtBottom,
    streamState.streamingContent,
    streamState.streamingReasoning,
    streamState.activeToolCalls.length,
    workEvents.length,
    messages.length,
  ]);

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

  // Restore the active workflow execution when the user returns to a thread.
  useEffect(() => {
    if (!activeThreadId) return;
    const controller = new AbortController();
    const restoredRunId = activeRunId;

    apiService
      .getActiveWorkflowExecutions(controller.signal, {
        threadId: activeThreadId,
        executionId: restoredRunId ?? undefined,
      })
      .then((executions) => {
        if (controller.signal.aborted) {
          return;
        }

        const matchingExecution = executions.find(
          (execution) => execution.metadata?.threadId === activeThreadId,
        );

        if (!matchingExecution) {
          const state = useAgentChatStore.getState();
          if (
            restoredRunId &&
            state.activeThreadId === activeThreadId &&
            state.activeRunId === restoredRunId
          ) {
            clearStaleActiveRun();
          }
          return;
        }

        setActiveRun(matchingExecution.id, {
          startedAt: matchingExecution.startedAt ?? null,
          status:
            matchingExecution.status === WorkflowExecutionStatus.RUNNING
              ? 'running'
              : 'idle',
        });
      })
      .catch(() => {
        /* ignore restore failures */
      });

    return () => controller.abort();
  }, [
    activeRunId,
    activeThreadId,
    apiService,
    clearStaleActiveRun,
    setActiveRun,
  ]);

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
    isLoadingOlderMessages,
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
    sendFollowUpNow,
    followUpQueue,
    promoteQueuedFollowUp: followUpQueue.promoteOldest,
    retryFollowUp: followUpQueue.retry,
    handleSubmitInputRequest,
    handleUiAction,
    handleApprovePlan,
    handleRequestPlanChanges,
    handleCreateFollowUpTasks,
    scrollToBottom,
    loadOlderMessages,
  };
}
