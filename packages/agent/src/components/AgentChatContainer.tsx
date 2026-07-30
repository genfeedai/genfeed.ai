import { AgentChatEmptyState } from '@genfeedai/agent/components/AgentChatEmptyState';
import { AgentChatPromptBar } from '@genfeedai/agent/components/AgentChatPromptBar';
import { AgentChatSuggestionsBar } from '@genfeedai/agent/components/AgentChatSuggestionsBar';
import { AgentChatTimeline } from '@genfeedai/agent/components/AgentChatTimeline';
import { AgentConversationSkeleton } from '@genfeedai/agent/components/AgentConversationSkeleton';
import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import { AgentPlanReviewSection } from '@genfeedai/agent/components/AgentPlanReviewSection';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { OnboardingConversationCard } from '@genfeedai/agent/components/OnboardingConversationCard';
import { WorkflowPhaseProgressBar } from '@genfeedai/agent/components/WorkflowPhaseProgressBar';
import { DEFAULT_RUNTIME_AGENT_MODEL } from '@genfeedai/agent/constants/agent-runtime-model.constant';
import { useAgentChatContainer } from '@genfeedai/agent/hooks/use-agent-chat-container';
import type { AgentChatMessage as AgentChatMessageType } from '@genfeedai/agent/models/agent-chat.model';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { ArrowDown } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

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
  onBrandCreate?: (payload: {
    name: string;
    description: string;
  }) => void | Promise<void>;
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
  onBrandCreate,
  onCreateFollowUpTasks,
  onSelectCreditPack,
  onSelectIngredient,
  isStreaming = false,
  promptBarLayoutMode = 'fixed',
  onboardingMode = false,
  isWideLayout = false,
  workspacePlanningTaskId = null,
}: AgentChatContainerProps): ReactElement {
  const composerShell = useConversationComposerShell();
  const [selectedModel, setSelectedModel] = useState(
    () => model?.trim() || DEFAULT_RUNTIME_AGENT_MODEL,
  );
  const {
    isGenerating,
    error,
    setError,
    streamState,
    latestProposedPlan,
    onboardingSignupGiftCredits,
    onboardingTotalJourneyCredits,
    pendingInputRequest,
    socketConnectionState,
    workEvents,
    isBusy,
    isRunActive,
    isStreamingActive,
    isEmpty,
    activeThreadTitle,
    timeline,
    isAtBottom,
    isSubmittingInputRequest,
    activeUiAction,
    isCreatingFollowUpTasks,
    followUpTaskMessage,
    messagesEndRef,
    scrollContainerRef,
    chatAttachments,
    isAttachmentUploading,
    dragState,
    addFiles,
    removeAttachment,
    clearAllAttachments,
    getCompletedAttachments,
    dragHandlers,
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
  } = useAgentChatContainer({
    apiService,
    isLoadingThread,
    isReadOnly,
    isStreaming,
    model: selectedModel,
    onOnboardingCompleted,
    onCopy,
    onRegenerate,
    onCreateFollowUpTasks,
    onSelectIngredient,
    workspacePlanningTaskId,
  });

  const highlightedMessageId: string | null = null;
  const formattedError = useMemo(
    () => (error ? formatAgentError(error) : null),
    [error],
  );
  const handleRetryLastFailedRun = useCallback(async () => {
    const lastUser = [...timeline]
      .reverse()
      .find((entry) => entry.kind === 'user-message');
    if (!lastUser || lastUser.kind !== 'user-message') {
      return;
    }
    await handleRetry(lastUser.message);
  }, [handleRetry, timeline]);
  const conversationColumnMaxWidthClass = isWideLayout
    ? 'max-w-[52rem]'
    : 'max-w-[46rem]';
  const activeWorkEvent = useMemo(() => {
    // Prefer real tool/input work over stuck lifecycle bookends.
    const pendingOrRunning = [...workEvents]
      .reverse()
      .filter(
        (event) => event.status === 'pending' || event.status === 'running',
      );
    return (
      pendingOrRunning.find((event) =>
        Boolean(event.toolName || event.toolCallId),
      ) ??
      pendingOrRunning[0] ??
      null
    );
  }, [workEvents]);

  const handleSuggestionSend = useCallback(
    (prompt: string) => {
      handleSend(prompt, undefined, undefined, {
        ...(composerShell?.artifactReferences?.length
          ? {
              artifactReferences: composerShell.artifactReferences.map(
                (item) => ('reference' in item ? item.reference : item),
              ),
            }
          : {}),
        ...(composerShell?.brandId ? { brandId: composerShell.brandId } : {}),
        planModeEnabled: false,
      });
    },
    [composerShell?.artifactReferences, composerShell?.brandId, handleSend],
  );

  const promptBarSuggestions = suggestedActions?.length ? (
    <AgentChatSuggestionsBar
      suggestedActions={suggestedActions}
      isBusy={isBusy}
      isReadOnly={isReadOnly}
      onSend={handleSuggestionSend}
    />
  ) : null;
  const shouldRenderInlineComposerFeedback =
    !composerShell || composerShell.isComposerVisible === false;

  return (
    <div className="relative flex h-full flex-col">
      {formattedError && shouldRenderInlineComposerFeedback ? (
        <Alert
          className={cn(
            'mx-auto mt-3 w-[calc(100%-2rem)]',
            isWideLayout ? 'max-w-5xl' : 'max-w-4xl',
          )}
          onClose={() => setError(null)}
          type={AlertCategory.ERROR}
        >
          <span className="font-medium">{formattedError.title}</span>
          <span className="mt-0.5 block text-xs opacity-90">
            {formattedError.summary}
            {formattedError.recovery ? ` ${formattedError.recovery}` : null}
          </span>
        </Alert>
      ) : null}

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
          addFiles={addFiles}
          apiService={apiService}
          chatAttachments={chatAttachments}
          clearAllAttachments={clearAllAttachments}
          dragHandlers={dragHandlers}
          dragState={dragState}
          emptyStateTitle={emptyStateTitle}
          emptyStateDescription={emptyStateDescription}
          getCompletedAttachments={getCompletedAttachments}
          isAttachmentUploading={isAttachmentUploading}
          isBusy={isBusy}
          // Inspector docks the composer in the shell slot; full-page empty
          // keeps it inline and centered under the hero.
          isComposerVisible={composerShell?.placement !== 'inspector'}
          isReadOnly={isReadOnly}
          isRunActive={isRunActive}
          isWideLayout={isWideLayout}
          variant={
            composerShell?.placement === 'inspector' ? 'inspector' : 'default'
          }
          onSend={handleSend}
          onStop={handleStopRun}
          placeholder={placeholder}
          promptBarSuggestions={promptBarSuggestions}
          removeAttachment={removeAttachment}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
      ) : (
        <div
          className={cn(
            'relative flex flex-1 overflow-hidden',
            isReadOnly && 'opacity-60',
          )}
        >
          {pendingInputRequest &&
          (onboardingMode || shouldRenderInlineComposerFeedback) ? (
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
                'mx-auto space-y-1 p-4 md:px-6',
                // Floating/portaled composer overlays the transcript — pad so
                // the last turns can scroll clear of the frosted bar.
                composerShell?.isComposerVisible === false
                  ? 'pb-6'
                  : 'pb-56 md:pb-72',
                conversationColumnMaxWidthClass,
              )}
            >
              {activeThreadTitle ? (
                <div className="mb-4 border-b border-border/50 px-1 pb-3">
                  <p className="truncate text-sm font-semibold tracking-tight text-foreground/85">
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
                onRetryLastFailedRun={handleRetryLastFailedRun}
                onOAuthConnect={onOAuthConnect}
                onBrandCreate={onBrandCreate}
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
                icon={<ArrowDown className="size-4" />}
                ariaLabel="Scroll to latest message"
                className="rounded-full border border-border/70 bg-background/88 text-foreground/72 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm hover:text-foreground"
                withWrapper={false}
                onClick={scrollToBottom}
              />
            </div>
          )}
        </div>
      )}

      {(composerShell?.isComposerVisible ?? true) &&
      (!isEmpty ||
        onboardingMode ||
        composerShell?.placement === 'inspector') ? (
        <AgentChatPromptBar
          activeWorkEvent={activeWorkEvent}
          addFiles={addFiles}
          apiService={apiService}
          chatAttachments={chatAttachments}
          clearAllAttachments={clearAllAttachments}
          dragHandlers={dragHandlers}
          dragState={dragState}
          error={
            composerShell && error
              ? `${formatAgentError(error).title}: ${formatAgentError(error).summary}`
              : null
          }
          getCompletedAttachments={getCompletedAttachments}
          isAttachmentUploading={isAttachmentUploading}
          isBusy={
            isBusy || isLoadingThread || socketConnectionState !== 'connected'
          }
          isReadOnly={isReadOnly}
          isRunActive={isRunActive}
          isSubmittingInputRequest={isSubmittingInputRequest}
          latestProposedPlan={latestProposedPlan}
          layoutMode={promptBarLayoutMode}
          onClearError={() => setError(null)}
          onModelChange={setSelectedModel}
          onSend={handleSend}
          onStop={handleStopRun}
          onSubmitInputRequest={handleSubmitInputRequest}
          pendingInputRequest={
            composerShell && !onboardingMode ? pendingInputRequest : null
          }
          placeholder={placeholder}
          promptBarSuggestions={promptBarSuggestions}
          removeAttachment={removeAttachment}
          selectedModel={selectedModel}
          showSuggestedActionsWhenNotEmpty={showSuggestedActionsWhenNotEmpty}
          socketConnectionState={socketConnectionState}
        />
      ) : null}
    </div>
  );
}
