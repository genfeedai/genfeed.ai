import { AgentChatEmptyState } from '@genfeedai/agent/components/AgentChatEmptyState';
import type { ExtractedMention } from '@genfeedai/agent/components/AgentChatInput';
import { AgentChatPromptBar } from '@genfeedai/agent/components/AgentChatPromptBar';
import { AgentChatTimeline } from '@genfeedai/agent/components/AgentChatTimeline';
import { AgentConversationSkeleton } from '@genfeedai/agent/components/AgentConversationSkeleton';
import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import { AgentPlanReviewSection } from '@genfeedai/agent/components/AgentPlanReviewSection';
import { AGENT_REFRESH_CONVERSATIONS_EVENT } from '@genfeedai/agent/components/AgentThreadList';
import { OnboardingConversationCard } from '@genfeedai/agent/components/OnboardingConversationCard';
import { WorkflowPhaseProgressBar } from '@genfeedai/agent/components/WorkflowPhaseProgressBar';
import { useAgentChat } from '@genfeedai/agent/hooks/use-agent-chat';
import { useAgentChatStream } from '@genfeedai/agent/hooks/use-agent-chat-stream';
import {
  AGENT_DRAFT_SUGGESTION_EVENT,
  type AgentDraftSuggestionPayload,
} from '@genfeedai/agent/hooks/use-agent-draft-context';
import type {
  AgentChatMessage as AgentChatMessageType,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { applyDashboardOperation } from '@genfeedai/agent/utils/apply-dashboard-operation';
import { deriveTimeline } from '@genfeedai/agent/utils/derive-timeline';
import { mapToolCallResponse } from '@genfeedai/agent/utils/map-tool-call-response';
import { resolveRetryPrompt } from '@genfeedai/agent/utils/resolve-retry-prompt';
import {
  AgentThreadStatus,
  AlertCategory,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/enums';
import type {
  AgentDashboardOperation,
  AgentUIBlock,
} from '@genfeedai/interfaces';
import type { ChatAttachment } from '@genfeedai/props/ui/attachments.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAttachments } from '@hooks/ui/use-attachments/use-attachments';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiOutlineArrowDown } from 'react-icons/hi2';

interface AgentChatContainerProps {
  apiService: AgentApiService;
  archivedNotice?: string | null;
  isLoadingThread?: boolean;
  isReadOnly?: boolean;
  model?: string;
  placeholder?: string;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  suggestedActions?: SuggestedAction[];
  showSuggestedActionsWhenNotEmpty?: boolean;
  onOnboardingCompleted?: () => void | Promise<void>;
  onCopy?: (content: string) => void | Promise<void>;
  onRegenerate?: (message: AgentChatMessageType) => void | Promise<void>;
  onOAuthConnect?: (platform: string) => void;
  onCreateFollowUpTasks?: (taskId: string) => Promise<{ createdCount: number }>;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
  onSelectIngredient?: (ingredient: { id: string; title?: string }) => void;
  isStreaming?: boolean;
  promptBarLayoutMode?: 'fixed' | 'surface-fixed';
  onboardingMode?: boolean;
  isWideLayout?: boolean;
  workspacePlanningTaskId?: string | null;
}

export function AgentChatContainer({
  apiService,
  archivedNotice,
  isLoadingThread = false,
  isReadOnly = false,
  model,
  placeholder,
  emptyStateTitle = 'Start a thread',
  emptyStateDescription = 'Ask me to generate images, create posts, check analytics, and more',
  suggestedActions,
  showSuggestedActionsWhenNotEmpty = false,
  onOnboardingCompleted,
  onCopy,
  onRegenerate,
  onOAuthConnect,
  onCreateFollowUpTasks,
  onSelectCreditPack,
  onSelectIngredient: onSelectIngredientProp,
  isStreaming = false,
  promptBarLayoutMode = 'fixed',
  onboardingMode = false,
  isWideLayout = false,
  workspacePlanningTaskId = null,
}: AgentChatContainerProps): ReactElement {
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
  // Only gate input by streaming state when this container is actually using streaming mode.
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
    onUpload: (file, onProgress) =>
      runAgentApiEffect(apiService.uploadAttachmentEffect(file, onProgress)),
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasLoadingThreadRef = useRef(isLoadingThread);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const highlightedMessageId: string | null = null;
  const [elapsedNow, setElapsedNow] = useState(() => Date.now());
  const [isSubmittingInputRequest, setIsSubmittingInputRequest] =
    useState(false);
  const [activeUiAction, setActiveUiAction] = useState<string | null>(null);
  const [isCreatingFollowUpTasks, setIsCreatingFollowUpTasks] = useState(false);
  const [followUpTaskMessage, setFollowUpTaskMessage] = useState<string | null>(
    null,
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
  const normalizedSuggestedActions = useMemo(
    () =>
      (suggestedActions ?? []).map((action, index) => ({
        ...action,
        id: action.id ?? `suggested-action-${index}-${action.label}`,
      })),
    [suggestedActions],
  );
  const promptBarSuggestions =
    normalizedSuggestedActions.length > 0 ? (
      <PromptBarSuggestions
        suggestions={normalizedSuggestedActions}
        onSuggestionSelect={(action) => {
          const normalizedPrompt = action.prompt.trim().toLowerCase();
          const normalizedLabel = action.label.trim().toLowerCase();

          if (
            normalizedPrompt === 'use plan mode in this thread' ||
            normalizedLabel === 'use plan mode'
          ) {
            void togglePlanMode(true);
            return;
          }

          followLatestTurn('smooth');
          sendMessage(action.prompt);
        }}
        isDisabled={isBusy || isReadOnly}
        maxSuggestions={normalizedSuggestedActions.length}
        className="justify-center"
      />
    ) : null;
  const isRunActive =
    activeRunStatus === 'running' || activeRunStatus === 'cancelling';
  const conversationColumnMaxWidthClass = isWideLayout
    ? 'max-w-[52rem]'
    : 'max-w-[46rem]';
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

  const timeline = useMemo(
    () =>
      deriveTimeline(
        messages,
        workEvents,
        streamState as Parameters<typeof deriveTimeline>[2],
        runDurationLabel,
      ),
    [messages, workEvents, streamState, runDurationLabel],
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

  const handleSend = useCallback(
    (
      content: string,
      _mentions?: ExtractedMention[],
      attachments?: ChatAttachment[],
      options?: {
        planModeEnabled?: boolean;
      },
    ) => {
      if (isReadOnly) {
        setError('Archived threads are read-only.');
        return;
      }
      followLatestTurn('smooth');
      sendMessage(content, {
        attachments,
        planModeEnabled: options?.planModeEnabled ?? draftPlanModeEnabled,
      });
    },
    [draftPlanModeEnabled, followLatestTurn, isReadOnly, sendMessage, setError],
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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (
      wasLoadingThreadRef.current &&
      !isLoadingThread &&
      messages.length > 0
    ) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      setIsAtBottom(true);
    }

    wasLoadingThreadRef.current = isLoadingThread;
  }, [isLoadingThread, messages.length]);

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
    ],
  );

  const handleUiAction = useCallback(
    async (action: string, payload?: Record<string, unknown>) => {
      if (isReadOnly) {
        setError('Archived threads are read-only.');
        return;
      }

      if (action === 'send_prompt') {
        const prompt =
          typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';

        if (!prompt) {
          setError('No follow-up prompt is available for this action.');
          return;
        }

        followLatestTurn('smooth');
        void sendMessage(prompt);
        return;
      }

      if (action === 'apply_to_draft') {
        const text = typeof payload?.text === 'string' ? payload.text : '';

        if (!text.trim()) {
          setError('No generated text is available for this action.');
          return;
        }

        if (typeof window === 'undefined') {
          setError('Draft updates are only available in the browser.');
          return;
        }

        const pageContext = useAgentChatStore.getState().pageContext;
        const event = new CustomEvent<AgentDraftSuggestionPayload>(
          AGENT_DRAFT_SUGGESTION_EVENT,
          {
            cancelable: true,
            detail: {
              mode: pageContext?.selectedText ? 'replace-selection' : 'append',
              selectedText: pageContext?.selectedText,
              sourceAction:
                typeof payload?.sourceAction === 'string'
                  ? payload.sourceAction
                  : undefined,
              text,
            },
          },
        );

        const wasHandled = !window.dispatchEvent(event);

        if (!wasHandled) {
          setError('Open a writing surface before applying text to a draft.');
          return;
        }

        setError(null);
        return;
      }

      if (!activeThreadId) {
        setError('No active thread selected.');
        return;
      }

      if (isBusy || activeUiAction) {
        setError('A UI action is already in progress.');
        return;
      }

      setActiveUiAction(action);
      setError(null);

      try {
        const response = await runAgentApiEffect(
          apiService.respondToUiActionEffect(activeThreadId, action, payload),
        );

        if (response.threadId !== activeThreadId) {
          setActiveThread(response.threadId);
        }

        const now = new Date().toISOString();
        const existingThread = threads.find(
          (thread) => thread.id === response.threadId,
        );

        upsertThread({
          createdAt: existingThread?.createdAt ?? now,
          id: response.threadId,
          planModeEnabled:
            existingThread?.planModeEnabled ?? draftPlanModeEnabled,
          status: AgentThreadStatus.ACTIVE,
          title: existingThread?.title ?? 'Agent thread',
          updatedAt: now,
        });

        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.dispatchEvent(new Event(AGENT_REFRESH_CONVERSATIONS_EVENT));
          }, 2000);
        }

        setCreditsRemaining(response.creditsRemaining);

        addMessage({
          content: response.message.content,
          createdAt: new Date().toISOString(),
          id: `assistant-${Date.now()}`,
          metadata: {
            toolCalls: response.toolCalls.map(mapToolCallResponse),
            ...response.message.metadata,
          },
          role: 'assistant',
          threadId: response.threadId,
        });
        const returnedPlan = response.message.metadata?.proposedPlan as
          | typeof latestProposedPlan
          | undefined;
        setLatestProposedPlan(
          returnedPlan ??
            (action === 'approve_plan' && latestProposedPlan
              ? {
                  ...latestProposedPlan,
                  approvedAt: new Date().toISOString(),
                  awaitingApproval: false,
                  lastReviewAction: 'approve',
                  status: 'approved',
                }
              : null),
        );

        const metadata = response.message.metadata;
        const uiBlocksState =
          metadata?.uiBlocks &&
          typeof metadata.uiBlocks === 'object' &&
          !Array.isArray(metadata.uiBlocks)
            ? (metadata.uiBlocks as {
                blockIds?: string[];
                blocks?: AgentUIBlock[];
                operation?: AgentDashboardOperation;
              })
            : null;
        const dashboardOperation =
          typeof metadata?.dashboardOperation === 'string'
            ? (metadata.dashboardOperation as AgentDashboardOperation)
            : uiBlocksState?.operation;

        if (uiBlocksState?.blocks && dashboardOperation) {
          applyDashboardOperation(
            dashboardOperation,
            uiBlocksState.blocks,
            uiBlocksState.blockIds,
          );
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to respond to UI action',
        );
      } finally {
        setActiveUiAction(null);
      }
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
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to create follow-up tasks from this plan.',
      );
    } finally {
      setIsCreatingFollowUpTasks(false);
    }
  }, [onCreateFollowUpTasks, setError, workspacePlanningTaskId]);

  const hasRenderableThreadState =
    messages.length > 0 ||
    Boolean(latestProposedPlan) ||
    Boolean(pendingInputRequest) ||
    workEvents.length > 0 ||
    streamState.isStreaming ||
    streamState.streamingContent.length > 0 ||
    streamState.streamingReasoning.length > 0;
  const isEmpty = !hasRenderableThreadState;

  useEffect(() => {
    if (!isRunActive || !runStartedAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunActive, runStartedAt]);

  useEffect(() => {
    setFollowUpTaskMessage(null);
  }, []);

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
          status:
            matchingRun.status === 'cancelled'
              ? 'cancelled'
              : matchingRun.status === 'completed'
                ? 'completed'
                : matchingRun.status === 'failed'
                  ? 'failed'
                  : 'running',
        });
      })
      .catch(() => {
        /* ignore restore failures */
      });

    return () => controller.abort();
  }, [activeThreadId, apiService, setActiveRun]);

  return (
    <div className="relative flex h-full flex-col">
      {error && (
        <Alert
          type={AlertCategory.ERROR}
          onClose={() => setError(null)}
          className={cn(
            'mx-auto mt-3 w-[calc(100%-2rem)]',
            isWideLayout ? 'max-w-5xl' : 'max-w-4xl',
          )}
        >
          {error}
        </Alert>
      )}

      {archivedNotice && (
        <Alert
          type={AlertCategory.WARNING}
          className={cn(
            'mx-auto mt-3 w-[calc(100%-2rem)]',
            isWideLayout ? 'max-w-5xl' : 'max-w-4xl',
          )}
        >
          {archivedNotice}
        </Alert>
      )}

      {isLoadingThread && isEmpty ? (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <AgentConversationSkeleton
              isWideLayout={isWideLayout}
              title={activeThreadTitle}
            />
          </div>
        </div>
      ) : isEmpty && !onboardingMode ? (
        <AgentChatEmptyState
          apiService={apiService}
          emptyStateTitle={emptyStateTitle}
          emptyStateDescription={emptyStateDescription}
          isWideLayout={isWideLayout}
          isBusy={isBusy}
          isReadOnly={isReadOnly}
          isRunActive={isRunActive}
          placeholder={placeholder}
          chatAttachments={chatAttachments}
          isAttachmentUploading={isAttachmentUploading}
          dragState={dragState}
          dragHandlers={dragHandlers}
          addFiles={addFiles}
          removeAttachment={removeAttachment}
          getCompletedAttachments={getCompletedAttachments}
          clearAllAttachments={clearAllAttachments}
          onSend={handleSend}
          onStop={handleStopRun}
          promptBarSuggestions={promptBarSuggestions}
        />
      ) : (
        <>
          <div
            className={cn(
              'relative flex flex-1 overflow-hidden',
              isReadOnly && 'opacity-60',
            )}
          >
            {pendingInputRequest ? (
              <AgentInputRequestOverlay
                isSubmitting={isSubmittingInputRequest}
                onSubmit={handleSubmitInputRequest}
                request={pendingInputRequest}
                variant={onboardingMode ? 'inline' : 'overlay'}
              />
            ) : null}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
              <div
                className={cn(
                  'mx-auto space-y-1 p-4 pb-56 md:px-6 md:pb-72',
                  conversationColumnMaxWidthClass,
                )}
              >
                {activeThreadTitle ? (
                  <div className="mb-5 px-1">
                    <p className="truncate text-sm font-medium text-foreground/70">
                      {activeThreadTitle}
                    </p>
                  </div>
                ) : null}

                <WorkflowPhaseProgressBar />

                {latestProposedPlan ? (
                  <AgentPlanReviewSection
                    plan={latestProposedPlan}
                    isBusy={isBusy}
                    activeUiAction={activeUiAction}
                    isCreatingFollowUpTasks={isCreatingFollowUpTasks}
                    followUpTaskMessage={followUpTaskMessage}
                    showFollowUpButton={
                      Boolean(workspacePlanningTaskId) &&
                      Boolean(onCreateFollowUpTasks) &&
                      latestProposedPlan.status === 'approved'
                    }
                    onApprove={handleApprovePlan}
                    onRequestChanges={handleRequestPlanChanges}
                    onCreateFollowUpTasks={handleCreateFollowUpTasks}
                  />
                ) : null}

                {isEmpty && onboardingMode && (
                  <div className="flex flex-col items-center px-2 pt-8 pb-4">
                    <OnboardingConversationCard
                      signupGiftCredits={onboardingSignupGiftCredits}
                      totalJourneyCredits={onboardingTotalJourneyCredits}
                      onStart={handleSend}
                      isDisabled={isBusy || isReadOnly}
                    />
                  </div>
                )}

                <AgentChatTimeline
                  timeline={timeline}
                  pendingUiActions={streamState.pendingUiActions}
                  isGenerating={isGenerating}
                  isStreamingActive={isStreamingActive}
                  isBusy={isBusy}
                  highlightedMessageId={highlightedMessageId}
                  apiService={apiService}
                  messagesEndRef={messagesEndRef}
                  onCopy={handleCopy}
                  onRetry={handleRetry}
                  onRegenerate={onRegenerate}
                  onOAuthConnect={onOAuthConnect}
                  onSelectCreditPack={onSelectCreditPack}
                  onSelectIngredient={handleIngredientSelect}
                  onUiAction={handleUiAction}
                />
              </div>
            </div>

            {!isAtBottom && (
              <div className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2 md:bottom-28">
                <Button
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.ICON}
                  icon={<HiOutlineArrowDown className="size-4" />}
                  ariaLabel="Scroll to latest message"
                  className="rounded-full border border-border/70 bg-background/88 text-foreground/72 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm hover:text-foreground"
                  withWrapper={false}
                  onClick={scrollToBottom}
                />
              </div>
            )}
          </div>

          <AgentChatPromptBar
            apiService={apiService}
            layoutMode={promptBarLayoutMode}
            isBusy={isBusy}
            isReadOnly={isReadOnly}
            isRunActive={isRunActive}
            placeholder={placeholder}
            showSuggestedActionsWhenNotEmpty={showSuggestedActionsWhenNotEmpty}
            promptBarSuggestions={promptBarSuggestions}
            onSend={handleSend}
            onStop={handleStopRun}
          />
        </>
      )}
    </div>
  );
}
