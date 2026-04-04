import {
  AgentChatInput,
  type ExtractedMention,
} from '@genfeedai/agent/components/AgentChatInput';
import {
  AgentChatMessage,
  UiActionRenderer,
} from '@genfeedai/agent/components/AgentChatMessage';
import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import { AgentPlanReviewCard } from '@genfeedai/agent/components/AgentPlanReviewCard';
import { AGENT_REFRESH_CONVERSATIONS_EVENT } from '@genfeedai/agent/components/AgentThreadList';
import { AnimatedStatusText } from '@genfeedai/agent/components/AnimatedStatusText';
import { OnboardingConversationCard } from '@genfeedai/agent/components/OnboardingConversationCard';
import { TimelineStreamingRow } from '@genfeedai/agent/components/TimelineStreamingRow';
import { TimelineWorkGroup } from '@genfeedai/agent/components/TimelineWorkGroup';
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
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { applyDashboardOperation } from '@genfeedai/agent/utils/apply-dashboard-operation';
import { deriveTimeline } from '@genfeedai/agent/utils/derive-timeline';
import { mapToolCallResponse } from '@genfeedai/agent/utils/map-tool-call-response';
import { resolveRetryPrompt } from '@genfeedai/agent/utils/resolve-retry-prompt';
import { PhaseProgress } from '@genfeedai/agent/workflow/components/PhaseProgress';
import { useAgentWorkflowStore } from '@genfeedai/agent/workflow/store';
import type { AgentDashboardOperation, AgentUIBlock } from '@genfeedai/interfaces';
import {
  AgentThreadStatus,
  AlertCategory,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAttachments } from '@hooks/ui/use-attachments/use-attachments';
import type { ChatAttachment } from '@props/ui/attachments.props';
import Button from '@ui/buttons/base/Button';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import Alert from '@ui/feedback/alert/Alert';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiOutlineArrowDown, HiOutlineSparkles } from 'react-icons/hi2';

function AgentConversationSkeleton({
  isWideLayout = false,
  title,
}: {
  isWideLayout?: boolean;
  title?: string | null;
}): ReactElement {
  const conversationColumnMaxWidthClass = isWideLayout
    ? 'max-w-[52rem]'
    : 'max-w-[46rem]';

  return (
    <div
      className="relative flex min-h-full flex-1 flex-col"
      data-testid="conversation-skeleton"
    >
      <div className="flex-1 overflow-y-auto">
        <div
          className={cn(
            'mx-auto flex w-full flex-col px-4 py-5 pb-56 md:px-6 md:pb-72',
            conversationColumnMaxWidthClass,
          )}
        >
          <div className="mb-8 px-1">
            {title ? (
              <p className="truncate text-sm font-medium text-foreground/70">
                {title}
              </p>
            ) : (
              <Skeleton className="h-4 w-28 rounded-full bg-white/[0.04]" />
            )}
          </div>

          <div className="flex flex-1 flex-col gap-12 pt-1">
            <div className="flex justify-end">
              <Skeleton className="h-10 w-40 rounded-2xl bg-white/[0.05]" />
            </div>

            <div className="max-w-[40rem] space-y-3 pt-2">
              <Skeleton className="h-4 w-[78%] rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-[74%] rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-[60%] rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-[76%] rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-[66%] rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-[52%] rounded-full bg-white/[0.04]" />
            </div>
          </div>
        </div>
      </div>

      <PromptBarContainer
        layoutMode="surface-fixed"
        maxWidth="4xl"
        showTopFade
        zIndex={10}
        className="bottom-3 md:bottom-5"
      >
        <div className="rounded-[1.75rem] border border-white/[0.08] bg-background/80 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <Skeleton className="mb-4 h-5 w-28 rounded-full bg-white/[0.04]" />
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-40 rounded-full bg-white/[0.04]" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-16 rounded-full bg-white/[0.04]" />
              <Skeleton className="h-8 w-8 rounded-full bg-white/[0.04]" />
            </div>
          </div>
        </div>
      </PromptBarContainer>
    </div>
  );
}

/**
 * Shows the workflow phase progress bar when a workflow is active (not in exploring/complete).
 */
function WorkflowPhaseProgressBar() {
  const phase = useAgentWorkflowStore((s) => s.phase);
  if (
    phase === 'exploring' &&
    useAgentWorkflowStore.getState().transitions.length === 0
  ) {
    return null;
  }
  return (
    <div className="mb-4">
      <PhaseProgress />
    </div>
  );
}

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
  }, [latestProposedPlan?.id, workspacePlanningTaskId]);

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
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 flex-1 overflow-y-auto px-6 py-10 md:px-8 md:py-14">
            <div
              className={cn(
                'mx-auto flex h-full w-full flex-col items-center justify-center',
                isWideLayout ? 'max-w-4xl' : 'max-w-4xl',
              )}
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.05] ring-1 ring-inset ring-foreground/[0.08]">
                <HiOutlineSparkles className="h-6 w-6 text-foreground/68" />
              </div>

              <h2 className="mb-2 text-center text-[clamp(1.75rem,3vw,2.4rem)] font-semibold tracking-tight text-foreground">
                {emptyStateTitle}
              </h2>
              <p className="max-w-xl text-center text-sm leading-6 text-foreground/58">
                {emptyStateDescription}
              </p>

              <PromptBarContainer
                layoutMode="inflow"
                maxWidth={isWideLayout ? '2xl' : '4xl'}
                zIndex={60}
                className="mt-5 w-full"
              >
                <AgentChatInput
                  onSend={handleSend}
                  disabled={isBusy || isReadOnly}
                  placeholder={placeholder}
                  apiService={apiService}
                  onStop={handleStopRun}
                  showStop={isRunActive}
                  attachments={chatAttachments}
                  isUploading={isAttachmentUploading}
                  dragState={dragState}
                  dragHandlers={dragHandlers}
                  addFiles={addFiles}
                  removeAttachment={removeAttachment}
                  getCompletedAttachments={getCompletedAttachments}
                  clearAllAttachments={clearAllAttachments}
                />
              </PromptBarContainer>

              {promptBarSuggestions ? (
                <div className="mt-5">{promptBarSuggestions}</div>
              ) : null}
            </div>
          </div>
        </div>
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
                  'mx-auto space-y-1 px-4 py-4 pb-56 md:px-6 md:pb-72',
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
                  <div className="mb-6">
                    <AgentPlanReviewCard
                      extraActions={
                        workspacePlanningTaskId &&
                        onCreateFollowUpTasks &&
                        latestProposedPlan.status === 'approved' ? (
                          <Button
                            variant={ButtonVariant.SECONDARY}
                            withWrapper={false}
                            onClick={() => {
                              void handleCreateFollowUpTasks();
                            }}
                            isDisabled={
                              Boolean(activeUiAction) ||
                              isBusy ||
                              isCreatingFollowUpTasks
                            }
                            className="rounded-xl px-4 py-2 text-sm"
                          >
                            {isCreatingFollowUpTasks
                              ? 'Creating Tasks...'
                              : 'Create Follow-up Tasks'}
                          </Button>
                        ) : null
                      }
                      footerMessage={followUpTaskMessage}
                      isBusy={Boolean(activeUiAction) || isBusy}
                      plan={latestProposedPlan}
                      onApprove={handleApprovePlan}
                      onRequestChanges={handleRequestPlanChanges}
                    />
                  </div>
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

                {timeline.map((entry, index) => {
                  switch (entry.kind) {
                    case 'user-message':
                    case 'assistant-message':
                      return (
                        <AgentChatMessage
                          key={entry.id}
                          messageIndex={index}
                          message={entry.message}
                          messageAnchorId={`agent-message-${entry.message.id}`}
                          isHighlighted={
                            highlightedMessageId === entry.message.id
                          }
                          isBusy={isBusy}
                          apiService={apiService}
                          onCopy={handleCopy}
                          onRetry={handleRetry}
                          onRegenerate={onRegenerate}
                          onOAuthConnect={onOAuthConnect}
                          onSelectCreditPack={onSelectCreditPack}
                          onSelectIngredient={handleIngredientSelect}
                          onUiAction={handleUiAction}
                        />
                      );
                    case 'work-group':
                      return <TimelineWorkGroup key={entry.id} entry={entry} />;
                    case 'streaming':
                      return (
                        <TimelineStreamingRow key={entry.id} entry={entry} />
                      );
                    default:
                      return null;
                  }
                })}

                {streamState.pendingUiActions.length > 0 &&
                  streamState.pendingUiActions.map((action) => (
                    <UiActionRenderer
                      key={`pending-ui-action-${action.id}`}
                      action={action}
                      apiService={apiService}
                      onCopy={handleCopy}
                      onOAuthConnect={onOAuthConnect}
                      onSelectCreditPack={onSelectCreditPack}
                      onSelectIngredient={handleIngredientSelect}
                      onUiAction={handleUiAction}
                    />
                  ))}

                {isGenerating &&
                  !isStreamingActive &&
                  !timeline.some((e) => e.kind === 'streaming') && (
                    <div className="flex items-center gap-2.5 py-4">
                      <AnimatedStatusText
                        text="Thinking"
                        className="text-xs text-muted-foreground"
                      />
                    </div>
                  )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {!isAtBottom && (
              <div className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2 md:bottom-28">
                <Button
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.ICON}
                  icon={<HiOutlineArrowDown className="h-4 w-4" />}
                  ariaLabel="Scroll to latest message"
                  className="rounded-full border border-white/[0.14] bg-background/80 shadow-lg backdrop-blur-sm"
                  withWrapper={false}
                  onClick={scrollToBottom}
                />
              </div>
            )}
          </div>

          <PromptBarContainer
            layoutMode={promptBarLayoutMode}
            maxWidth="4xl"
            showTopFade
            topContent={
              showSuggestedActionsWhenNotEmpty && promptBarSuggestions ? (
                <div className="px-1 pb-3">{promptBarSuggestions}</div>
              ) : undefined
            }
            zIndex={40}
            className={cn(
              promptBarLayoutMode === 'fixed' && 'bottom-2 md:bottom-4',
              promptBarLayoutMode === 'surface-fixed' && 'bottom-3 md:bottom-5',
            )}
          >
            <AgentChatInput
              onSend={handleSend}
              disabled={isBusy || isReadOnly}
              placeholder={
                isReadOnly ? 'Archived threads are read-only' : placeholder
              }
              onStop={handleStopRun}
              apiService={apiService}
              showStop={isRunActive}
            />
          </PromptBarContainer>
        </>
      )}
    </div>
  );
}
