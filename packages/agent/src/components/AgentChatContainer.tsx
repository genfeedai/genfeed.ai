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
import { useAgentChatContainer } from '@genfeedai/agent/hooks/use-agent-chat-container';
import type { AgentChatMessage as AgentChatMessageType } from '@genfeedai/agent/models/agent-chat.model';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useCallback, useMemo } from 'react';
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
    model,
    onOnboardingCompleted,
    onCopy,
    onRegenerate,
    onCreateFollowUpTasks,
    onSelectIngredient,
    workspacePlanningTaskId,
  });

  const highlightedMessageId: string | null = null;
  const conversationColumnMaxWidthClass = isWideLayout
    ? 'max-w-[52rem]'
    : 'max-w-[46rem]';
  const activeWorkEvent = useMemo(
    () =>
      [...workEvents]
        .reverse()
        .find(
          (event) => event.status === 'pending' || event.status === 'running',
        ) ?? null,
    [workEvents],
  );

  const handleSuggestionSend = useCallback(
    (prompt: string) => {
      handleSend(prompt, undefined, undefined, {
        ...(composerShell?.artifactReferences?.length
          ? {
              artifactReferences: composerShell.artifactReferences.map(
                (item) => item.reference,
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

  return (
    <div className="relative flex h-full flex-col">
      {error && !composerShell ? (
        <Alert
          className={cn(
            'mx-auto mt-3 w-[calc(100%-2rem)]',
            isWideLayout ? 'max-w-5xl' : 'max-w-4xl',
          )}
          onClose={() => setError(null)}
          type={AlertCategory.ERROR}
        >
          {error}
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
          isComposerVisible={!composerShell}
          isReadOnly={isReadOnly}
          isRunActive={isRunActive}
          isWideLayout={isWideLayout}
          onSend={handleSend}
          onStop={handleStopRun}
          placeholder={placeholder}
          promptBarSuggestions={promptBarSuggestions}
          removeAttachment={removeAttachment}
        />
      ) : (
        <div
          className={cn(
            'relative flex flex-1 overflow-hidden',
            isReadOnly && 'opacity-60',
          )}
        >
          {pendingInputRequest && (onboardingMode || !composerShell) ? (
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
                icon={<HiOutlineArrowDown className="size-4" />}
                ariaLabel="Scroll to latest message"
                className="rounded-full border border-border/70 bg-background/88 text-foreground/72 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm hover:text-foreground"
                withWrapper={false}
                onClick={scrollToBottom}
              />
            </div>
          )}
        </div>
      )}

      {composerShell || !isEmpty || onboardingMode ? (
        <AgentChatPromptBar
          activeWorkEvent={activeWorkEvent}
          addFiles={addFiles}
          apiService={apiService}
          chatAttachments={chatAttachments}
          clearAllAttachments={clearAllAttachments}
          dragHandlers={dragHandlers}
          dragState={dragState}
          error={composerShell ? error : null}
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
          onSend={handleSend}
          onStop={handleStopRun}
          onSubmitInputRequest={handleSubmitInputRequest}
          pendingInputRequest={
            composerShell && !onboardingMode ? pendingInputRequest : null
          }
          placeholder={placeholder}
          promptBarSuggestions={promptBarSuggestions}
          removeAttachment={removeAttachment}
          showSuggestedActionsWhenNotEmpty={showSuggestedActionsWhenNotEmpty}
          socketConnectionState={socketConnectionState}
        />
      ) : null}
    </div>
  );
}
