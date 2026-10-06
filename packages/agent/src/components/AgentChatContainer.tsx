import { AgentArchivedComposerBar } from '@genfeedai/agent/components/AgentArchivedComposerBar';
import {
  AgentChatContainerThreadView,
  selectActiveWorkEvent,
} from '@genfeedai/agent/components/AgentChatContainerThreadView';
import { AgentChatEmptyState } from '@genfeedai/agent/components/AgentChatEmptyState';
import { AgentChatPromptBar } from '@genfeedai/agent/components/AgentChatPromptBar';
import { AgentChatSuggestionsBar } from '@genfeedai/agent/components/AgentChatSuggestionsBar';
import { AgentConversationSkeleton } from '@genfeedai/agent/components/AgentConversationSkeleton';
import { AgentDesktopRuntimeBar } from '@genfeedai/agent/components/AgentDesktopRuntimeBar';
import { AgentWebLocalCliNotice } from '@genfeedai/agent/components/AgentWebLocalCliNotice';
import type { AgentChatContainerProps } from '@genfeedai/agent/components/agent-chat-container.types';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { AGENT_CONVERSATION_TRACK_CLASS } from '@genfeedai/agent/constants/conversation-layout.constant';
import { captureAgentStreamHydration } from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import { useAgentChatContainer } from '@genfeedai/agent/hooks/use-agent-chat-container';
import { useAgentRuntimeSelection } from '@genfeedai/agent/hooks/use-agent-runtime-selection';
import { useOverlayElementHeight } from '@genfeedai/agent/hooks/use-overlay-element-height';
import { useStableSocketConnectionState } from '@genfeedai/agent/hooks/use-stable-socket-connection-state';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { selectActiveRun } from '@genfeedai/agent/stores/agent-chat.store.run';
import {
  mapSnapshotPendingInputRequest,
  mapSnapshotRunStatus,
  readSnapshotRunError,
} from '@genfeedai/agent/utils/agent-thread-snapshot.util';
import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import { getGenfeedDesktopBridge } from '@genfeedai/agent/utils/desktop-bridge.util';
import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { resolveComposerTranscriptPaddingPx } from '@genfeedai/agent/utils/resolve-composer-transcript-padding.util';
import { AlertCategory } from '@genfeedai/contracts';
import { ONBOARDING_GREETING } from '@genfeedai/contracts/constants';
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
  knowledgeSelection,
  knowledgeSection,
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
  onOpenInStudio,
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
  // Desktop only: pick Claude Code / Codex (user's own subscription) or a
  // hosted Genfeed runtime for this thread.
  const runtimeSelection = useAgentRuntimeSelection({
    apiService,
    isActive: getGenfeedDesktopBridge() !== null,
  });
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  // In the plain web app a thread bound to a local CLI cannot send: the
  // notice offers the two ways forward instead of the Desktop runtime bar.
  const runtimeBanner =
    isReadOnly ? null : runtimeSelection.webBlockedRuntime ? (
      <AgentWebLocalCliNotice
        onSwitchToHosted={runtimeSelection.switchToHosted}
        runtime={runtimeSelection.webBlockedRuntime}
        threadId={activeThreadId}
      />
    ) : runtimeSelection.hasDesktopCliRuntimes ||
      runtimeSelection.runtimeNotice ? (
      <AgentDesktopRuntimeBar selection={runtimeSelection} />
    ) : null;

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

  useEffect(() => {
    if (
      !onboardingMode ||
      !activeThreadId ||
      container.pendingInputRequest ||
      stableSocketConnectionState === 'connected'
    )
      return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recover = async () => {
      const initial = useAgentChatStore.getState();
      const initialRun = selectActiveRun(initial);
      const canHydrate = captureAgentStreamHydration(activeThreadId);
      try {
        const snapshot = await apiService.getThreadSnapshot(
          activeThreadId,
          controller.signal,
        );
        const state = useAgentChatStore.getState();
        const currentRun = selectActiveRun(state);
        if (
          controller.signal.aborted ||
          state.activeThreadId !== activeThreadId ||
          state.pendingInputRequest ||
          state.threadUiBusyById[activeThreadId] ||
          !canHydrate(snapshot) ||
          ((initialRun.status === 'running' ||
            initialRun.status === 'cancelling') &&
            snapshot.activeRun?.runId !== initialRun.runId) ||
          currentRun.runId !== initialRun.runId ||
          currentRun.status !== initialRun.status ||
          snapshot.lastSequence <
            (state.threadEventSequenceById[activeThreadId] ?? 0)
        )
          return;
        const card = mapSnapshotPendingInputRequest(snapshot);
        const status = mapSnapshotRunStatus(snapshot.activeRun?.status);
        if (
          card ||
          status === 'failed' ||
          status === 'completed' ||
          status === 'cancelled'
        ) {
          state.applyThreadSnapshotState(activeThreadId, snapshot);
          state.resetStreamState();
          state.transitionRun(activeThreadId, {
            type: 'begin',
            runId: snapshot.activeRun?.runId ?? null,
            status,
            startedAt: snapshot.activeRun?.startedAt,
          });
          state.transitionRun(activeThreadId, {
            type: 'generating',
            isGenerating: false,
          });
          state.setPendingInputRequest(card);
          const error = readSnapshotRunError(snapshot);
          if (error) state.setError(error);
        }
      } catch {
        // Keep REST input available while snapshot recovery retries.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(recover, 2000);
      }
    };
    void recover();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    activeThreadId,
    apiService,
    container.pendingInputRequest,
    onboardingMode,
    stableSocketConnectionState,
  ]);

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
  // A generation review card (Manual mode, #4672) owns the failure/retry
  // chrome for its turn — the generic AgentRunFailureCard must not stack
  // beneath it.
  const hasDockedGenerationCard = container.streamState.pendingUiActions.some(
    (action) => action.type === 'generation_action_card',
  );

  const sendConversationMessage = useCallback(
    (
      content: string,
      mentions?: Parameters<typeof container.handleSend>[1],
      attachments?: Parameters<typeof container.handleSend>[2],
      options?: Parameters<typeof container.handleSend>[3],
    ) => {
      composerShell?.onSendMessage?.();
      return container.handleSend(content, mentions, attachments, options);
    },
    [composerShell?.onSendMessage, container.handleSend],
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
        agentMode: container.draftAgentMode,
      });
    },
    [
      composerShell?.artifactReferences,
      composerShell?.brandId,
      container.draftAgentMode,
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
  // The dock and registered overlays host the prompt bar in a shell slot even
  // for an empty conversation; only the full page keeps it inline under the
  // hero.
  const isShellHostedComposer =
    composerShell?.placement === 'dock' ||
    composerShell?.placement === 'overlay';
  // When the docked composer is visible, status/errors live above the glass
  // bar (Claude/T3 pattern) — not as sticky timeline chrome.
  const hasOnboardingQuestion =
    onboardingMode && Boolean(container.pendingInputRequest);
  const [greetingCreatedAt] = useState(() => new Date().toISOString());
  const greetingTimeline: TimelineEntry[] = [
    {
      kind: 'assistant-message',
      id: 'onboarding-greeting',
      createdAt: greetingCreatedAt,
      message: {
        id: 'onboarding-greeting',
        threadId: activeThreadId ?? '',
        role: 'assistant',
        content: ONBOARDING_GREETING,
        createdAt: greetingCreatedAt,
      },
    },
  ];
  const isComposerDocked =
    (composerShell?.isComposerVisible ?? true) &&
    (onboardingMode || !container.isEmpty || isShellHostedComposer);
  const shouldRenderInlineComposerFeedback =
    !isComposerDocked || hasOnboardingQuestion;
  // Archived threads replace the prompt bar with restore chrome — always dock it
  // so empty archived threads still get Unarchive instead of a dead input.
  const isArchivedThread = Boolean(isReadOnly && archivedNotice);
  const shouldShowDockedComposer =
    !hasOnboardingQuestion && (isComposerDocked || isArchivedThread);
  const shouldShowArchivedComposer = isArchivedThread && Boolean(onUnarchive);
  const composerTranscriptPaddingPx = resolveComposerTranscriptPaddingPx({
    hasFollowUpChips:
      showSuggestedActionsWhenNotEmpty && Boolean(promptBarSuggestions),
    isComposerVisible:
      !hasOnboardingQuestion && composerShell?.isComposerVisible !== false,
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

        {isLoadingThread && container.isEmpty && !onboardingMode ? (
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <AgentConversationSkeleton
              isWideLayout={isWideLayout}
              title={container.activeThreadTitle}
            />
          </div>
        ) : container.isEmpty && !onboardingMode ? (
          <AgentChatEmptyState
            composerPaddingPx={
              onboardingMode ? composerTranscriptPaddingPx : undefined
            }
            addFiles={container.addFiles}
            agentMode={container.draftAgentMode}
            onAgentModeChange={container.setAgentMode}
            apiService={apiService}
            knowledgeSelection={knowledgeSelection}
            knowledgeSection={knowledgeSection}
            chatAttachments={container.chatAttachments}
            clearAllAttachments={container.clearAllAttachments}
            composerBanner={runtimeBanner}
            dragHandlers={container.dragHandlers}
            dragState={container.dragState}
            emptyStateTitle={emptyStateTitle}
            emptyStateDescription={emptyStateDescription}
            followUps={container.followUpQueue.queue}
            getCompletedAttachments={container.getCompletedAttachments}
            isAttachmentUploading={container.isAttachmentUploading}
            isBusy={container.isBusy}
            // The dock and overlays host the composer in a shell slot;
            // full-page empty keeps it inline and centered under the hero.
            // Archived threads use the docked restore bar instead of a dead
            // input.
            isComposerVisible={
              !onboardingMode && !isArchivedThread && !isShellHostedComposer
            }
            isReadOnly={isReadOnly}
            isRunActive={container.isRunActive}
            isWideLayout={isWideLayout}
            variant={composerShell?.placement === 'dock' ? 'dock' : 'default'}
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
            isPlanReviewPending={container.isPlanReviewPending}
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
            onOpenInStudio={onOpenInStudio}
            onRegenerate={onRegenerate}
            onRequestPlanChanges={container.handleRequestPlanChanges}
            onRetry={container.handleRetry}
            onRetryLastFailedRun={handleRetryLastFailedRun}
            onSelectCreditPack={onSelectCreditPack}
            onSubmitInputRequest={container.handleSubmitInputRequest}
            onUiAction={container.handleUiAction}
            padBottomForComposer={
              !hasOnboardingQuestion &&
              composerShell?.isComposerVisible !== false
            }
            composerTranscriptPaddingPx={composerTranscriptPaddingPx}
            pendingInputRequest={container.pendingInputRequest}
            pendingUiActions={container.streamState.pendingUiActions}
            hasDockedGenerationCard={hasDockedGenerationCard}
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
            timeline={
              onboardingMode && container.isEmpty
                ? greetingTimeline
                : container.timeline
            }
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
              composerBanner={
                onboardingMode ? undefined : (runtimeBanner ?? undefined)
              }
              activeWorkEvent={activeWorkEvent}
              workEvents={container.workEvents}
              addFiles={container.addFiles}
              agentMode={container.draftAgentMode}
              onAgentModeChange={container.setAgentMode}
              apiService={apiService}
              knowledgeSelection={knowledgeSelection}
              knowledgeSection={knowledgeSection}
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
                (!onboardingMode && isLoadingThread) ||
                (onboardingMode && !activeThreadId) ||
                (!onboardingMode && stableSocketConnectionState !== 'connected')
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
