import {
  AgentChatContainerThreadView,
  selectActiveWorkEvent,
} from '@genfeedai/agent/components/AgentChatContainerThreadView';
import { AgentChatEmptyState } from '@genfeedai/agent/components/AgentChatEmptyState';
import { AgentChatPromptBar } from '@genfeedai/agent/components/AgentChatPromptBar';
import { AgentChatSuggestionsBar } from '@genfeedai/agent/components/AgentChatSuggestionsBar';
import { AgentConversationSkeleton } from '@genfeedai/agent/components/AgentConversationSkeleton';
import type { AgentChatContainerProps } from '@genfeedai/agent/components/agent-chat-container.types';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { UNRESOLVED_RUNTIME_AGENT_MODEL } from '@genfeedai/agent/constants/agent-runtime-model.constant';
import { AGENT_CONVERSATION_TRACK_CLASS } from '@genfeedai/agent/constants/conversation-layout.constant';
import { useAgentChatContainer } from '@genfeedai/agent/hooks/use-agent-chat-container';
import { useAgentRegistryModels } from '@genfeedai/agent/hooks/use-agent-registry-models';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { findPendingGenerationAction } from '@genfeedai/agent/utils/find-pending-generation-action';
import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { AlertCategory } from '@genfeedai/enums';
import Alert from '@ui/feedback/alert/Alert';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type { AgentChatContainerProps } from '@genfeedai/agent/components/agent-chat-container.types';

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
  const messages = useAgentChatStore((state) => state.messages);
  const {
    defaultModelKey,
    isLoading: isRegistryModelsLoading,
    models: registryModels,
  } = useAgentRegistryModels(apiService);
  const [selectedModel, setSelectedModel] = useState(
    () => model?.trim() || UNRESOLVED_RUNTIME_AGENT_MODEL,
  );

  useEffect(() => {
    if (isRegistryModelsLoading || registryModels.length === 0) {
      return;
    }
    const keys = new Set(registryModels.map((entry) => entry.key));
    if (selectedModel && keys.has(selectedModel)) {
      return;
    }
    const next =
      (model?.trim() && keys.has(model.trim()) ? model.trim() : null) ||
      defaultModelKey ||
      registryModels[0]?.key ||
      UNRESOLVED_RUNTIME_AGENT_MODEL;
    if (next !== selectedModel) {
      setSelectedModel(next);
    }
  }, [
    defaultModelKey,
    isRegistryModelsLoading,
    model,
    registryModels,
    selectedModel,
  ]);

  const container = useAgentChatContainer({
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
    () => (container.error ? formatAgentError(container.error) : null),
    [container.error],
  );
  const handleRetryLastFailedRun = useCallback(async () => {
    const lastUser = [...container.timeline]
      .reverse()
      .find((entry) => entry.kind === 'user-message');
    if (!lastUser || lastUser.kind !== 'user-message') {
      return;
    }
    await container.handleRetry(lastUser.message);
  }, [container.handleRetry, container.timeline]);

  // Full-width pane so the transcript scrollbar sits on the window edge
  // (Codex-style). Content + composer share AGENT_CONVERSATION_TRACK_CLASS.
  // min-w-0 stops flex min-content from blowing past the shell width.
  const conversationColumnClass =
    'relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip';
  const activeWorkEvent = useMemo(
    () =>
      selectActiveWorkEvent(container.workEvents, {
        isStreamActive: container.isBusy,
      }),
    [container.isBusy, container.workEvents],
  );

  const handleSuggestionSend = useCallback(
    (prompt: string) => {
      container.handleSend(prompt, undefined, undefined, {
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
    [
      composerShell?.artifactReferences,
      composerShell?.brandId,
      container.handleSend,
    ],
  );

  const promptBarSuggestions = suggestedActions?.length ? (
    <AgentChatSuggestionsBar
      suggestedActions={suggestedActions}
      isBusy={container.isBusy}
      isReadOnly={isReadOnly}
      onSend={handleSuggestionSend}
    />
  ) : null;
  const pendingGenerationAction = useMemo(
    () =>
      [...container.streamState.pendingUiActions]
        .reverse()
        .find((action) => action.type === 'generation_action_card') ??
      findPendingGenerationAction(messages),
    [container.streamState.pendingUiActions, messages],
  );
  const shouldRenderInlineComposerFeedback =
    !composerShell || composerShell.isComposerVisible === false;

  const shouldShowDockedComposer =
    (composerShell?.isComposerVisible ?? true) &&
    (!container.isEmpty ||
      onboardingMode ||
      composerShell?.placement === 'inspector');

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/*
        One width owner for transcript + floating composer. Both children are
        w-full of this track so card edges and the prompt shell match exactly.
      */}
      <div
        className={conversationColumnClass}
        data-testid="agent-conversation-column"
      >
        {formattedError && shouldRenderInlineComposerFeedback ? (
          <div className={AGENT_CONVERSATION_TRACK_CLASS}>
            <Alert
              className="mt-3 w-full"
              onClose={() => container.setError(null)}
              type={AlertCategory.ERROR}
            >
              <span className="font-medium">{formattedError.title}</span>
              <span className="mt-0.5 block text-xs opacity-90">
                {formattedError.summary}
                {formattedError.recovery ? ` ${formattedError.recovery}` : null}
              </span>
            </Alert>
          </div>
        ) : null}

        {archivedNotice ? (
          <div className={AGENT_CONVERSATION_TRACK_CLASS}>
            <Alert type={AlertCategory.WARNING} className="mt-3 w-full">
              {archivedNotice}
            </Alert>
          </div>
        ) : null}

        {isLoadingThread && container.isEmpty ? (
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <AgentConversationSkeleton
              isWideLayout={isWideLayout}
              title={container.activeThreadTitle}
            />
          </div>
        ) : container.isEmpty && !onboardingMode ? (
          <AgentChatEmptyState
            addFiles={container.addFiles}
            apiService={apiService}
            chatAttachments={container.chatAttachments}
            clearAllAttachments={container.clearAllAttachments}
            dragHandlers={container.dragHandlers}
            dragState={container.dragState}
            emptyStateTitle={emptyStateTitle}
            emptyStateDescription={emptyStateDescription}
            getCompletedAttachments={container.getCompletedAttachments}
            isAttachmentUploading={container.isAttachmentUploading}
            isBusy={container.isBusy}
            // Inspector docks the composer in the shell slot; full-page empty
            // keeps it inline and centered under the hero.
            isComposerVisible={composerShell?.placement !== 'inspector'}
            isReadOnly={isReadOnly}
            isRunActive={container.isRunActive}
            isWideLayout={isWideLayout}
            variant={
              composerShell?.placement === 'inspector' ? 'inspector' : 'default'
            }
            onSend={container.handleSend}
            onStop={container.handleStopRun}
            placeholder={placeholder}
            promptBarSuggestions={promptBarSuggestions}
            removeAttachment={container.removeAttachment}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            models={registryModels}
            isModelsLoading={isRegistryModelsLoading}
          />
        ) : (
          <AgentChatContainerThreadView
            activeThreadTitle={container.activeThreadTitle}
            activeUiAction={container.activeUiAction}
            apiService={apiService}
            followUpTaskMessage={container.followUpTaskMessage}
            highlightedMessageId={highlightedMessageId}
            isAtBottom={container.isAtBottom}
            isBusy={container.isBusy}
            isCreatingFollowUpTasks={container.isCreatingFollowUpTasks}
            isEmpty={container.isEmpty}
            isGenerating={container.isGenerating}
            isReadOnly={isReadOnly}
            isStreamingActive={container.isStreamingActive}
            isSubmittingInputRequest={container.isSubmittingInputRequest}
            latestProposedPlan={container.latestProposedPlan}
            messagesEndRef={container.messagesEndRef}
            onboardingMode={onboardingMode}
            onboardingSignupGiftCredits={
              container.onboardingSignupGiftCredits ?? undefined
            }
            onboardingTotalJourneyCredits={
              container.onboardingTotalJourneyCredits ?? undefined
            }
            onApprovePlan={container.handleApprovePlan}
            onBrandCreate={onBrandCreate}
            onCopy={container.handleCopy}
            onCreateFollowUpTasks={container.handleCreateFollowUpTasks}
            onIngredientSelect={container.handleIngredientSelect}
            onOAuthConnect={onOAuthConnect}
            onRegenerate={onRegenerate}
            onRequestPlanChanges={container.handleRequestPlanChanges}
            onRetry={container.handleRetry}
            onRetryLastFailedRun={handleRetryLastFailedRun}
            onSelectCreditPack={onSelectCreditPack}
            onSend={container.handleSend}
            onSubmitInputRequest={container.handleSubmitInputRequest}
            onUiAction={container.handleUiAction}
            padBottomForComposer={composerShell?.isComposerVisible !== false}
            padBottomForFollowUpChips={
              showSuggestedActionsWhenNotEmpty && Boolean(promptBarSuggestions)
            }
            pendingInputRequest={container.pendingInputRequest}
            pendingUiActions={container.streamState.pendingUiActions}
            scrollContainerRef={container.scrollContainerRef}
            scrollToBottom={container.scrollToBottom}
            shouldShowInputRequestOverlay={
              onboardingMode || shouldRenderInlineComposerFeedback
            }
            showFollowUpButton={
              Boolean(workspacePlanningTaskId) &&
              Boolean(onCreateFollowUpTasks) &&
              container.latestProposedPlan?.status === 'approved'
            }
            timeline={container.timeline}
          />
        )}

        {shouldShowDockedComposer ? (
          <AgentChatPromptBar
            activeGenerationAction={pendingGenerationAction}
            activeWorkEvent={activeWorkEvent}
            addFiles={container.addFiles}
            apiService={apiService}
            chatAttachments={container.chatAttachments}
            clearAllAttachments={container.clearAllAttachments}
            dragHandlers={container.dragHandlers}
            dragState={container.dragState}
            error={
              composerShell && container.error
                ? `${formatAgentError(container.error).title}: ${formatAgentError(container.error).summary}`
                : null
            }
            getCompletedAttachments={container.getCompletedAttachments}
            isAttachmentUploading={container.isAttachmentUploading}
            isBusy={
              container.isBusy ||
              isLoadingThread ||
              container.socketConnectionState !== 'connected'
            }
            isReadOnly={isReadOnly}
            isRunActive={container.isRunActive}
            isSubmittingInputRequest={container.isSubmittingInputRequest}
            latestProposedPlan={container.latestProposedPlan}
            layoutMode={promptBarLayoutMode}
            onClearError={() => container.setError(null)}
            onModelChange={setSelectedModel}
            onSend={container.handleSend}
            onStop={container.handleStopRun}
            onSubmitInputRequest={container.handleSubmitInputRequest}
            onUiAction={container.handleUiAction}
            pendingInputRequest={
              composerShell && !onboardingMode
                ? container.pendingInputRequest
                : null
            }
            placeholder={placeholder}
            promptBarSuggestions={promptBarSuggestions}
            removeAttachment={container.removeAttachment}
            selectedModel={selectedModel}
            models={registryModels}
            isModelsLoading={isRegistryModelsLoading}
            showSuggestedActionsWhenNotEmpty={showSuggestedActionsWhenNotEmpty}
            socketConnectionState={container.socketConnectionState}
          />
        ) : null}
      </div>
    </div>
  );
}
