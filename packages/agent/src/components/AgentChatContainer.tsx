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
import { UNRESOLVED_RUNTIME_AGENT_MODEL } from '@genfeedai/agent/constants/agent-runtime-model.constant';
import { AGENT_CONVERSATION_TRACK_CLASS } from '@genfeedai/agent/constants/conversation-layout.constant';
import { useAgentChatContainer } from '@genfeedai/agent/hooks/use-agent-chat-container';
import { useAgentRegistryModels } from '@genfeedai/agent/hooks/use-agent-registry-models';
import { useOverlayElementHeight } from '@genfeedai/agent/hooks/use-overlay-element-height';
import { useStableSocketConnectionState } from '@genfeedai/agent/hooks/use-stable-socket-connection-state';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  readPreferredAgentChatModel,
  readPreferredAgentChatPriority,
  writePreferredAgentChatModel,
  writePreferredAgentChatPriority,
} from '@genfeedai/agent/stores/agent-preferred-model.store';
import {
  isAutoAgentModel,
  toRuntimeAgentModel,
} from '@genfeedai/agent/utils/agent-auto-model.util';
import { findPendingGenerationAction } from '@genfeedai/agent/utils/find-pending-generation-action';
import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { resolveComposerTranscriptPaddingPx } from '@genfeedai/agent/utils/resolve-composer-transcript-padding.util';
import { resolveThreadGenerationType } from '@genfeedai/agent/utils/thread-generation-type';
import { useOptionalUser } from '@genfeedai/contexts/user/user-context/user-context';
import {
  AlertCategory,
  fromRouterPriority,
  RouterPriority,
  toRouterPriority,
} from '@genfeedai/enums';
import { User } from '@genfeedai/models/auth/user.model';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import Alert from '@ui/feedback/alert/Alert';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  const composerOverlayHeightPx = useOverlayElementHeight(
    composerShell?.portalTarget ?? composerOverlayElement,
  );
  const userContext = useOptionalUser();
  const currentUser = userContext?.currentUser ?? null;
  const mutateUser = userContext?.mutateUser;
  // Only treat settings as authoritative once the user payload is present —
  // otherwise an empty defaultAgentModel during load would force Auto forever.
  const hasUserSettings = Boolean(currentUser?.settings);
  const settingsDefaultModel =
    currentUser?.settings?.defaultAgentModel?.trim() ?? '';
  const settingsPriority =
    toRouterPriority(currentUser?.settings?.generationPriority) ??
    RouterPriority.BALANCED;
  const messages = useAgentChatStore((state) => state.messages);
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const creditsRemaining = useAgentChatStore((state) => state.creditsRemaining);
  const stickyGenerationActionRef = useRef<{
    action: AgentUiAction;
    threadId: string | null;
  } | null>(null);
  const persistSettingsInFlight = useRef(false);
  const pendingSettingsPatch = useRef<{
    defaultAgentModel?: string;
    generationPriority?: ReturnType<typeof fromRouterPriority>;
  } | null>(null);
  const {
    defaultModelKey,
    isLoading: isRegistryModelsLoading,
    models: registryModels,
  } = useAgentRegistryModels(apiService);
  // SSR-safe initials — localStorage is read only after mount (hydration).
  const [selectedModel, setSelectedModel] = useState(
    () => model?.trim() || UNRESOLVED_RUNTIME_AGENT_MODEL,
  );
  const [prioritize, setPrioritize] = useState<RouterPriority>(
    RouterPriority.BALANCED,
  );

  useEffect(() => {
    const preferredModel = readPreferredAgentChatModel();
    if (!model?.trim() && preferredModel) {
      setSelectedModel(preferredModel);
    }
    const preferredPriority = readPreferredAgentChatPriority();
    if (preferredPriority) {
      setPrioritize(preferredPriority);
    }
    // Mount-only hydrate from localStorage.
  }, []);

  useEffect(() => {
    // Prefer server settings once the user payload is present; otherwise keep
    // the localStorage priority so a refresh after Lowest Cost doesn't flash
    // back to BALANCED before hydrate.
    if (hasUserSettings) {
      setPrioritize(settingsPriority);
    }
  }, [hasUserSettings, settingsPriority]);

  const persistChatDefaults = useCallback(
    async (patch: {
      defaultAgentModel?: string;
      generationPriority?: ReturnType<typeof fromRouterPriority>;
    }) => {
      if (!currentUser?.id || !mutateUser) {
        return;
      }

      // Merge concurrent patches (Auto priority + model clear often fire as a
      // pair). Dropping the second call left generationPriority stuck on
      // BALANCED after refresh.
      pendingSettingsPatch.current = {
        ...pendingSettingsPatch.current,
        ...patch,
      };

      if (persistSettingsInFlight.current) {
        return;
      }

      persistSettingsInFlight.current = true;
      let settingsSnapshot = { ...currentUser.settings };
      try {
        while (pendingSettingsPatch.current) {
          const nextPatch = pendingSettingsPatch.current;
          pendingSettingsPatch.current = null;
          const token = await apiService.getToken();
          if (!token) {
            // Do not drop the patch — re-queue so a later call can flush it.
            pendingSettingsPatch.current = {
              ...nextPatch,
              ...(pendingSettingsPatch.current ?? {}),
            };
            return;
          }
          await UsersService.getInstance(token).patchSettings(
            currentUser.id,
            nextPatch,
          );
          settingsSnapshot = {
            ...settingsSnapshot,
            ...nextPatch,
          };
          mutateUser(
            new User({
              ...currentUser,
              settings: settingsSnapshot,
            }),
          );
        }
      } catch {
        // Preference patch is best-effort — UI already reflects the pick.
      } finally {
        persistSettingsInFlight.current = false;
        // A patch may have been queued while we were finishing.
        if (pendingSettingsPatch.current) {
          void persistChatDefaults({});
        }
      }
    },
    [apiService, currentUser, mutateUser],
  );

  const handleModelChange = useCallback(
    (nextModel: string) => {
      const trimmed = nextModel.trim();
      if (!trimmed) {
        return;
      }
      setSelectedModel(trimmed);
      writePreferredAgentChatModel(trimmed);
      void persistChatDefaults({
        defaultAgentModel: isAutoAgentModel(trimmed) ? '' : trimmed,
      });
    },
    [persistChatDefaults],
  );

  const handlePrioritizeChange = useCallback(
    (next: RouterPriority) => {
      setPrioritize(next);
      writePreferredAgentChatPriority(next);
      // Selecting a priority also means Auto — clear any pinned model override.
      setSelectedModel(AUTO_MODEL_OPTION_VALUE);
      writePreferredAgentChatModel(AUTO_MODEL_OPTION_VALUE);
      void persistChatDefaults({
        defaultAgentModel: '',
        generationPriority: fromRouterPriority(next),
      });
    },
    [persistChatDefaults],
  );

  useEffect(() => {
    if (isRegistryModelsLoading) {
      return;
    }
    if (registryModels.length === 0) {
      if (selectedModel) {
        setSelectedModel(UNRESOLVED_RUNTIME_AGENT_MODEL);
      }
      return;
    }
    // Explicit Auto is first-class — never replace it with a registry default.
    if (isAutoAgentModel(selectedModel)) {
      writePreferredAgentChatModel(AUTO_MODEL_OPTION_VALUE);
      return;
    }
    const keys = new Set(registryModels.map((entry) => entry.key));
    if (selectedModel && keys.has(selectedModel)) {
      // Keep a valid user pick durable across reloads.
      writePreferredAgentChatModel(selectedModel);
      return;
    }
    const preferred = readPreferredAgentChatModel();
    // Wait for user settings before pinning a first default so empty
    // defaultAgentModel can land as Auto instead of racing the registry.
    if (!preferred && !model?.trim() && !hasUserSettings) {
      return;
    }
    const settingsOverride =
      settingsDefaultModel && keys.has(settingsDefaultModel)
        ? settingsDefaultModel
        : null;
    // Empty defaultAgentModel = Auto (Settings → Chat Defaults).
    const settingsMeansAuto = hasUserSettings && !settingsDefaultModel;
    const next =
      (model?.trim() && keys.has(model.trim()) ? model.trim() : null) ||
      (preferred === AUTO_MODEL_OPTION_VALUE
        ? AUTO_MODEL_OPTION_VALUE
        : preferred && keys.has(preferred)
          ? preferred
          : null) ||
      (settingsMeansAuto ? AUTO_MODEL_OPTION_VALUE : null) ||
      settingsOverride ||
      defaultModelKey ||
      registryModels[0]?.key ||
      UNRESOLVED_RUNTIME_AGENT_MODEL;
    if (next !== selectedModel) {
      setSelectedModel(next);
      if (next) {
        writePreferredAgentChatModel(next);
      }
    }
  }, [
    defaultModelKey,
    hasUserSettings,
    isRegistryModelsLoading,
    model,
    registryModels,
    selectedModel,
    settingsDefaultModel,
  ]);

  // Auto → omit model on the wire so the server resolves via defaults + priority.
  const runtimeModel =
    toRuntimeAgentModel(selectedModel) || UNRESOLVED_RUNTIME_AGENT_MODEL;

  const container = useAgentChatContainer({
    apiService,
    isLoadingThread,
    isReadOnly,
    isStreaming,
    model: runtimeModel,
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
  const threadGenerationType = useMemo(
    () => resolveThreadGenerationType(messages, activeThreadId),
    [activeThreadId, messages],
  );
  const resolvedGenerationAction = useMemo(
    () =>
      [...container.streamState.pendingUiActions]
        .reverse()
        .find(
          (action) =>
            action.type === 'generation_action_card' &&
            (threadGenerationType == null ||
              action.generationType === threadGenerationType),
        ) ??
      findPendingGenerationAction(
        messages,
        activeThreadId,
        threadGenerationType,
      ),
    [
      activeThreadId,
      container.streamState.pendingUiActions,
      messages,
      threadGenerationType,
    ],
  );

  // Hold the card across the hand-off gap.
  //
  // The action lives in `pendingUiActions` while streaming and in the persisted
  // message metadata afterwards. Finalization clears the stream state and loads
  // the messages in two separate store writes, so there is a render where both
  // sources are empty. That unmounted the card and silently discarded whatever
  // the user had typed or picked in it — which is why a chosen model appeared
  // to snap back to Auto. Retain the last action for the same thread instead.
  if (stickyGenerationActionRef.current?.threadId !== activeThreadId) {
    stickyGenerationActionRef.current = null;
  }
  if (
    stickyGenerationActionRef.current &&
    threadGenerationType &&
    stickyGenerationActionRef.current.action.generationType !==
      threadGenerationType
  ) {
    stickyGenerationActionRef.current = null;
  }
  if (resolvedGenerationAction) {
    stickyGenerationActionRef.current = {
      action: resolvedGenerationAction,
      threadId: activeThreadId,
    };
  }

  const pendingGenerationAction =
    resolvedGenerationAction ??
    stickyGenerationActionRef.current?.action ??
    null;
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
            placeholder={placeholder}
            promptBarSuggestions={emptyStatePromptBarSuggestions}
            removeAttachment={container.removeAttachment}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            onPrioritizeChange={handlePrioritizeChange}
            prioritize={prioritize}
            creditsAvailable={creditsRemaining}
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
            hasDockedGenerationCard={Boolean(pendingGenerationAction)}
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
              activeGenerationAction={pendingGenerationAction}
              activeWorkEvent={activeWorkEvent}
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
              onModelChange={handleModelChange}
              onMoveFollowUp={container.followUpQueue.move}
              onPrioritizeChange={handlePrioritizeChange}
              onPromoteQueuedFollowUp={container.promoteQueuedFollowUp}
              onRemoveFollowUp={container.followUpQueue.remove}
              onRetryFollowUp={container.retryFollowUp}
              onSend={sendConversationMessage}
              onSendFollowUpNow={container.sendFollowUpNow}
              isInterruptingFollowUps={container.followUpQueue.isInterrupting}
              onStop={container.handleStopRun}
              onSubmitInputRequest={container.handleSubmitInputRequest}
              onUiAction={container.handleUiAction}
              pendingInputRequest={
                composerShell && !onboardingMode
                  ? container.pendingInputRequest
                  : null
              }
              placeholder={placeholder}
              prioritize={prioritize}
              promptBarSuggestions={promptBarSuggestions}
              removeAttachment={container.removeAttachment}
              selectedModel={selectedModel}
              models={registryModels}
              isModelsLoading={isRegistryModelsLoading}
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
