import type { ExtractedMention } from '@genfeedai/agent/components/AgentChatInput';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { AGENT_MESSAGE_PAGE_SIZE } from '@genfeedai/agent/constants/agent-message-pagination.constant';
import { handleAgentUiAction } from '@genfeedai/agent/hooks/agent-chat-container.ui-actions';
import { captureAgentRunRestore } from '@genfeedai/agent/hooks/agent-chat-stream.restore-guard';
import type { AgentRunHandoff } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { useAgentChat } from '@genfeedai/agent/hooks/use-agent-chat';
import { useAgentChatStream } from '@genfeedai/agent/hooks/use-agent-chat-stream';
import { useAgentModePersistence } from '@genfeedai/agent/hooks/use-agent-mode-persistence';
import { useComposerFollowUpQueue } from '@genfeedai/agent/hooks/use-composer-follow-up-queue';
import { useDesktopCliAgentChat } from '@genfeedai/agent/hooks/use-desktop-cli-agent-chat';
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
import type { MappedSnapshotRunStatus } from '@genfeedai/agent/utils/agent-thread-snapshot.util';
import type { ComposerFollowUp } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import {
  computeStableTimelineEntries,
  EMPTY_STABLE_TIMELINE_ENTRIES_STATE,
  type StableTimelineEntriesState,
} from '@genfeedai/agent/utils/compute-stable-timeline-entries';
import {
  conversationMessagesBelongToThread,
  pinConversationScrollToBottom,
} from '@genfeedai/agent/utils/conversation-scroll.util';
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

function isAgentRunActive(status: MappedSnapshotRunStatus): boolean {
  return status === 'running' || status === 'cancelling';
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
  const markStreamLive = useAgentChatStore((s) => s.markStreamLive);
  const draftAgentMode = useAgentChatStore((s) => s.draftAgentMode);
  const savedAgentMode = useAgentChatStore((s) => s.savedAgentMode);
  const hasExplicitDraftAgentMode = useAgentChatStore(
    (s) => s.hasExplicitDraftAgentMode,
  );
  const sendAgentMode =
    activeThreadId || savedAgentMode !== null || hasExplicitDraftAgentMode
      ? draftAgentMode
      : undefined;
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
  const setLatestProposedPlan = useAgentChatStore(
    (s) => s.setLatestProposedPlan,
  );
  const upsertThread = useAgentChatStore((s) => s.upsertThread);

  const { sendMessage: sendNonStreaming } = useAgentChat({
    apiService,
    model,
    onOnboardingCompleted,
  });
  const {
    adoptRun,
    beginRunHandoff,
    cancelRunHandoff,
    sendMessage: sendStreaming,
    isStreaming: isStreamingActive,
  } = useAgentChatStream({
    apiService,
    model,
    onOnboardingCompleted,
  });

  // Threads on `local/claude-cli` / `local/codex-cli` run in Genfeed Desktop
  // on the user's own CLI subscription instead of the hosted API stream.
  const desktopCliChat = useDesktopCliAgentChat();
  const cancelDesktopCliTurn = desktopCliChat.cancelActiveTurn;
  const sendMessage = desktopCliChat.isEnabled
    ? desktopCliChat.sendMessage
    : isStreaming
      ? sendStreaming
      : sendNonStreaming;
  // One source of truth with the Stop button: while a run is active, a send
  // queues as a follow-up instead of starting a second run on the thread.
  const isRunActive = isAgentRunActive(activeRunStatus);
  const isTransportBusy =
    isGenerating || (isStreaming && isStreamingActive) || isRunActive;

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
  const inputSubmissionSequenceRef = useRef(0);
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

      const pinLatest = (): void => {
        pinConversationScrollToBottom(scrollContainerRef.current, behavior);
      };

      if (typeof window === 'undefined') {
        pinLatest();
        return;
      }

      window.requestAnimationFrame(pinLatest);
    },
    [],
  );

  const handleStopRun = useCallback(async (): Promise<boolean> => {
    if (cancelDesktopCliTurn()) {
      return true;
    }

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
    cancelDesktopCliTurn,
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
          knowledgeSelection: item.options?.knowledgeSelection,
          requestedSkillSlugs: item.options?.requestedSkillSlugs,
          agentMode: item.options?.agentMode,
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

  const setAgentMode = useAgentModePersistence(apiService);

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
        isAgentRunActive(liveState.activeRunStatus) ||
        (isStreaming &&
          liveState.stream.isStreaming &&
          liveState.activeRunStatus !== 'awaiting_input');

      const pendingAsk = liveState.pendingInputRequest;
      if (pendingAsk && !shouldQueueFollowUp) {
        const answer = content.trim();
        if (answer) {
          followLatestTurn('smooth');
          void Promise.resolve(submitInputRequestRef.current(answer)).catch(
            () => undefined,
          );
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
            knowledgeSelection: options?.knowledgeSelection,
            requestedSkillSlugs: options?.requestedSkillSlugs,
            agentMode: options?.agentMode ?? sendAgentMode,
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
        knowledgeSelection: options?.knowledgeSelection,
        requestedSkillSlugs: options?.requestedSkillSlugs,
        agentMode: options?.agentMode ?? sendAgentMode,
      });
      return true;
    },
    [
      sendAgentMode,
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

      const submissionSequence = ++inputSubmissionSequenceRef.current;
      let handoff: AgentRunHandoff | null = null;
      setIsSubmittingInputRequest(true);
      setError(null);
      clearPendingInputRequest();
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
        handoff = isStreaming ? beginRunHandoff(request.threadId) : null;
        const response = await apiService.respondToInputRequest(
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
        if (handoff) {
          if (response?.executionId) {
            adoptRun(handoff, response.executionId, response.queuedAt ?? null);
          } else {
            cancelRunHandoff(handoff);
          }
        }
      } catch {
        if (handoff) {
          cancelRunHandoff(handoff, request);
        }
        const currentState = useAgentChatStore.getState();
        if (
          handoff &&
          currentState.activeThreadId === request.threadId &&
          currentState.pendingInputRequest?.inputRequestId !==
            request.inputRequestId
        ) {
          return;
        }
        if (
          !handoff &&
          currentState.activeThreadId === request.threadId &&
          !currentState.pendingInputRequest
        ) {
          currentState.setPendingInputRequest(request);
        }
        if (currentState.activeThreadId !== request.threadId)
          throw new Error('Failed to submit the requested input.');
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
        throw new Error('Failed to submit the requested input.');
      } finally {
        if (submissionSequence === inputSubmissionSequenceRef.current)
          setIsSubmittingInputRequest(false);
      }
    },
    [
      addWorkEvent,
      adoptRun,
      apiService,
      beginRunHandoff,
      cancelRunHandoff,
      clearPendingInputRequest,
      isStreaming,
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
        draftAgentMode,
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
      draftAgentMode,
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
    followLatestTurn('smooth');
  }, [followLatestTurn]);

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
    inputSubmissionSequenceRef.current += 1;
    setIsSubmittingInputRequest(false);
    olderMessagesRequestEpochRef.current += 1;
    olderMessagesRequestInFlightRef.current = false;
    olderMessagesAbortControllerRef.current?.abort();
    olderMessagesAbortControllerRef.current = null;
    pendingScrollAnchorRef.current = null;
    setIsAtBottom(true);
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
    if (!conversationMessagesBelongToThread(messages, activeThreadId)) {
      return;
    }
    pinConversationScrollToBottom(scrollContainerRef.current);
  }, [
    activeThreadId,
    isAtBottom,
    messages,
    streamState.streamingContent,
    streamState.streamingReasoning,
    streamState.activeToolCalls.length,
    workEvents.length,
  ]);

  // Scroll-to-bottom when a thread first becomes readable (imperative DOM, not
  // derived UI). A thread restored from cache paints without ever flipping
  // isLoadingThread, so keying only off the loading transition would leave the
  // switch parked at the scroll offset of the thread the user just left.
  // The persistent conversation host reuses the scroller across `[id]` values,
  // so wait until the transcript actually belongs to the new thread before
  // claiming the pin — same-length swaps used to skip this effect.
  useLayoutEffect(() => {
    if (activeThreadId === null) {
      // Leaving for the no-thread surface ends this thread's claim on the
      // scroll position. Holding the id would mean re-entering that same
      // thread from cache matches neither branch below and never scrolls.
      scrolledThreadIdRef.current = null;
      wasLoadingThreadRef.current = isLoadingThread;
      return;
    }

    const hasFinishedLoading = wasLoadingThreadRef.current && !isLoadingThread;
    const isUnpinnedThread = activeThreadId !== scrolledThreadIdRef.current;
    const messagesMatchActiveThread = conversationMessagesBelongToThread(
      messages,
      activeThreadId,
    );

    if (
      (hasFinishedLoading || isUnpinnedThread) &&
      !isLoadingThread &&
      messagesMatchActiveThread
    ) {
      scrolledThreadIdRef.current = activeThreadId;
      pinConversationScrollToBottom(scrollContainerRef.current);
      // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setIsAtBottom(true);
    }

    wasLoadingThreadRef.current = isLoadingThread;
  }, [activeThreadId, isLoadingThread, messages]);

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
    const canRestore = captureAgentRunRestore(activeThreadId);

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

        if (!canRestore(matchingExecution?.id ?? null)) {
          return;
        }

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

        const isExecutionLive =
          matchingExecution.status === WorkflowExecutionStatus.RUNNING ||
          matchingExecution.status === WorkflowExecutionStatus.PENDING;
        setActiveRun(matchingExecution.id, {
          startedAt: matchingExecution.startedAt ?? null,
          status: isExecutionLive ? 'running' : 'idle',
        });
        // Without a live stream the transcript renders nothing while Stop and
        // WORKING are on, and no listener is attached to hear the run finish.
        if (isExecutionLive) {
          markStreamLive();
        }
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
    markStreamLive,
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
    draftAgentMode,
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
    setAgentMode,
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
