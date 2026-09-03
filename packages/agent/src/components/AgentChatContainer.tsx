import { AgentArchivedComposerBar } from '@genfeedai/agent/components/AgentArchivedComposerBar';
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
import { OnboardingConversationCard } from '@genfeedai/agent/components/OnboardingConversationCard';
import { AGENT_CONVERSATION_TRACK_CLASS } from '@genfeedai/agent/constants/conversation-layout.constant';
import { useAgentChatContainer } from '@genfeedai/agent/hooks/use-agent-chat-container';
import { useOverlayElementHeight } from '@genfeedai/agent/hooks/use-overlay-element-height';
import { useStableSocketConnectionState } from '@genfeedai/agent/hooks/use-stable-socket-connection-state';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { resolveComposerTranscriptPaddingPx } from '@genfeedai/agent/utils/resolve-composer-transcript-padding.util';
import { AlertCategory } from '@genfeedai/contracts';
import Alert from '@ui/feedback/alert/Alert';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

export type { AgentChatContainerProps } from '@genfeedai/agent/components/agent-chat-container.types';

export function AgentChatContainer({
  apiService,
  archivedNotice,
  isLoadingThread = false,
  isReadOnly = false,
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
  onUnarchive,
  isStreaming = false,
  promptBarLayoutMode = 'fixed',
  onboardingMode = false,
  isWideLayout = false,
  workspacePlanningTaskId = null,
}: AgentChatContainerProps): ReactElement {
  const composerShell = useConversationComposerShell();
  const [composerOverlayElement, setComposerOverlayElement] =
    useState<HTMLElement | null>(null);
  // The surface portal target contains the prompt stack, while its parent owns
  // the dock's bottom inset. Measure the whole dock so the final timeline row
  // can scroll clear of it instead of stopping flush against its top edge.
  const measuredComposerOverlayElement =
    composerShell?.placement === 'surface' && composerShell.portalTarget
      ? composerShell.portalTarget.parentElement
      : (composerShell?.portalTarget ?? composerOverlayElement);
  const composerOverlayHeightPx = useOverlayElementHeight(
    measuredComposerOverlayElement,
  );
  const creditsRemaining = useAgentChatStore((state) => state.creditsRemaining);

  const container = useAgentChatContainer({
    apiService,
    isLoadingThread,
    isReadOnly,
    isStreaming,
    onOnboardingCompleted,
    onCopy,
    onRegenerate,
    onCreateFollowUpTasks,
    onSelectIngredient,
    workspacePlanningTaskId,
  });
  // Debounce non-connected chrome so nest-fast-dev / Next HMR restarts do not
  // thrash the composer status stack into overflow-hidden parents.
  const stableSocketConnectionState = useStableSocketConnectionState(
    container.socketConnectionState,
  );

  const highlightedMessageId: string | null = null;
  const formattedError = useMemo(
    () => (container.error ? formatAgentError(container.error) : null),
    [container.error],
  );
  const handleRetryLastFailedRun = useCallback(async () => {
    const lastUser = [...container.timeline]
      .reverse()
      .find((entry) => entry.kind === 'user-message');
    if (lastUser?.kind !== 'user-message') {
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

  const sendConversationMessage = useCallback(
    (
      content: string,
      mentions?: Parameters<typeof container.handleSend>[1],
      attachments?: Parameters<typeof container.handleSend>[2],
      options?: Parameters<typeof container.handleSend>[3],
    ) => {
      return container.handleSend(content, mentions, attachments, options);
    },
    [container.handleSend],
  );

  const handleSuggestionSend = useCallback(
    (prompt: string) => {
      sendConversationMessage(prompt, undefined, undefined, {
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
      sendConversationMessage,
    ],
  );

  const promptBarSuggestions = suggestedActions?.length ? (
    <AgentChatSuggestionsBar
      suggestedActions={suggestedActions}
      isReadOnly={isReadOnly}
      onSend={handleSuggestionSend}
    />
  ) : null;
  const emptyStatePromptBarSuggestions = suggestedActions?.length ? (
    <AgentChatSuggestionsBar
      suggestedActions={suggestedActions}
      isReadOnly={isReadOnly}
      layout="equal"
      onSend={handleSuggestionSend}
    />
  ) : null;
  // When the docked composer is visible, status/errors live above the glass
  // bar (Claude/T3 pattern) — not as sticky timeline chrome.
  const isComposerDocked =
    (composerShell?.isComposerVisible ?? true) &&
    (!container.isEmpty || composerShell?.placement === 'inspector');
  const shouldRenderInlineComposerFeedback = !isComposerDocked;
  // Archived threads replace the prompt bar with restore chrome — always dock it
  // so empty archived threads still get Unarchive instead of a dead input.
  const isArchivedThread = Boolean(isReadOnly && archivedNotice);
  const shouldShowDockedComposer = isComposerDocked || isArchivedThread;
  const shouldShowArchivedComposer = isArchivedThread && Boolean(onUnarchive);
  const composerTranscriptPaddingPx = resolveComposerTranscriptPaddingPx({
    hasFollowUpChips:
      showSuggestedActionsWhenNotEmpty && Boolean(promptBarSuggestions),
    isComposerVisible: composerShell?.isComposerVisible !== false,
    overlayHeightPx: composerOverlayHeightPx,
  });

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col">
      {/*
        One column: transcript scroll + floating composer share the same
        AGENT_CONVERSATION_TRACK_CLASS width owner (portal or inflow).
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

        {isLoadingThread && container.isEmpty ? (
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <AgentConversationSkeleton
              isWideLayout={isWideLayout}
              title={container.activeThreadTitle}
            />
          </div>
        ) : container.isEmpty ? (
          <AgentChatEmptyState
            addFiles={container.addFiles}
            apiService={apiService}
            chatAttachments={container.chatAttachments}
            clearAllAttachments={container.clearAllAttachments}
            composerBanner={
              onboardingMode ? <OnboardingConversationCard /> : null
            }
            dragHandlers={container.dragHandlers}
            dragState={container.dragState}
            emptyStateTitle={emptyStateTitle}
            emptyStateDescription={emptyStateDescription}
            followUps={container.followUpQueue.queue}
            getCompletedAttachments={container.getCompletedAttachments}
            isAttachmentUploading={container.isAttachmentUploading}
            isBusy={container.isBusy}
            // Inspector docks the composer in the shell slot; full-page empty
            // keeps it inline and centered under the hero. Archived threads
            // use the docked restore bar instead of a dead input.
            isComposerVisible={
              !isArchivedThread && composerShell?.placement !== 'inspector'
            }
            isReadOnly={isReadOnly}
            isRunActive={container.isRunActive}
            isWideLayout={isWideLayout}
            variant={
              composerShell?.placement === 'inspector' ? 'inspector' : 'default'
            }
            onMoveFollowUp={container.followUpQueue.move}
            onPromoteQueuedFollowUp={container.promoteQueuedFollowUp}
            onRemoveFollowUp={container.followUpQueue.remove}
            onRetryFollowUp={container.retryFollowUp}
            onSend={sendConversationMessage}
            onSendFollowUpNow={container.sendFollowUpNow}
            isInterruptingFollowUps={container.followUpQueue.isInterrupting}
            onStop={container.handleStopRun}
            placeholder={container.pendingInputRequest?.prompt ?? placeholder}
            promptBarSuggestions={emptyStatePromptBarSuggestions}
            removeAttachment={container.removeAttachment}
            creditsAvailable={creditsRemaining}
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
            isGenerating={container.isGenerating}
            isWideLayout={isWideLayout}
            isReadOnly={isReadOnly}
            isStreamingActive={container.isStreamingActive}
            isSubmittingInputRequest={container.isSubmittingInputRequest}
            latestProposedPlan={container.latestProposedPlan}
            messagesEndRef={container.messagesEndRef}
            onboardingMode={onboardingMode}
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
            onSubmitInputRequest={container.handleSubmitInputRequest}
            onUiAction={container.handleUiAction}
            padBottomForComposer={composerShell?.isComposerVisible !== false}
            composerTranscriptPaddingPx={composerTranscriptPaddingPx}
            pendingInputRequest={container.pendingInputRequest}
            pendingUiActions={container.streamState.pendingUiActions}
            hasDockedGenerationCard={false}
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
          shouldShowArchivedComposer && onUnarchive ? (
            <AgentArchivedComposerBar
              layoutMode={promptBarLayoutMode}
              message={
                archivedNotice ??
                'This thread is archived. Unarchive it to continue the conversation.'
              }
              onUnarchive={onUnarchive}
            />
          ) : (
            <AgentChatPromptBar
              activeWorkEvent={activeWorkEvent}
              workEvents={container.workEvents}
              addFiles={container.addFiles}
              apiService={apiService}
              chatAttachments={container.chatAttachments}
              clearAllAttachments={container.clearAllAttachments}
              dragHandlers={container.dragHandlers}
              dragState={container.dragState}
              // Pass the raw error through. AgentComposerStatusStack runs
              // formatAgentError itself; pre-formatting here produced
              // "Title: Summary", which no longer matched any classifier
              // pattern on the second pass, so a real provider 401 degraded
              // into the generic "Run failed / The agent hit an error".
              error={isComposerDocked ? container.error : null}
              getCompletedAttachments={container.getCompletedAttachments}
              isAttachmentUploading={container.isAttachmentUploading}
              isBusy={container.isBusy}
              isComposerUnavailable={
                isLoadingThread || stableSocketConnectionState !== 'connected'
              }
              followUps={container.followUpQueue.queue}
              isReadOnly={isReadOnly}
              isRunActive={container.isRunActive}
              isSubmittingInputRequest={container.isSubmittingInputRequest}
              latestProposedPlan={container.latestProposedPlan}
              layoutMode={promptBarLayoutMode}
              onClearError={() => container.setError(null)}
              onOverlayElement={setComposerOverlayElement}
              creditsAvailable={creditsRemaining}
              onMoveFollowUp={container.followUpQueue.move}
              onPromoteQueuedFollowUp={container.promoteQueuedFollowUp}
              onRemoveFollowUp={container.followUpQueue.remove}
              onRetryFollowUp={container.retryFollowUp}
              onSend={sendConversationMessage}
              onSendFollowUpNow={container.sendFollowUpNow}
              isInterruptingFollowUps={container.followUpQueue.isInterrupting}
              onStop={container.handleStopRun}
              onSubmitInputRequest={container.handleSubmitInputRequest}
              pendingInputRequest={
                composerShell && !onboardingMode
                  ? container.pendingInputRequest
                  : null
              }
              placeholder={container.pendingInputRequest?.prompt ?? placeholder}
              promptBarSuggestions={promptBarSuggestions}
              removeAttachment={container.removeAttachment}
              showSuggestedActionsWhenNotEmpty={
                showSuggestedActionsWhenNotEmpty
              }
              socketConnectionState={stableSocketConnectionState}
            />
          )
        ) : null}
      </div>
    </div>
  );
}
