import type {
  DesktopContentPlatform,
  DesktopContentType,
  DesktopPublishIntent,
  IDesktopMessage,
  IDesktopThread,
  IDesktopTrendHandoff,
} from '@genfeedai/desktop-contracts';
import { DropZone } from '@renderer/components/DropZone';

import { ConversationComposerToolbar } from './ConversationComposerToolbar';
import { ConversationHeader } from './ConversationHeader';
import { ConversationInputBar } from './ConversationInputBar';
import ConversationMessages from './ConversationMessages';
import { ConversationSidepanel } from './ConversationSidepanel';
import { useConversationSend } from './useConversationSend';
import { useConversationState } from './useConversationState';

interface ConversationViewProps {
  onCreateThread: () => IDesktopThread;
  onSendMessage: (threadId: string, message: IDesktopMessage) => void;
  onSetStatus: (threadId: string, status: 'awaiting-response' | 'idle') => void;
  pendingTrend?: IDesktopTrendHandoff | null;
  onTrendConsumed?: () => void;
  thread: IDesktopThread | null;
  workspaceId: string | null;
}

export const ConversationView = ({
  onCreateThread,
  onSendMessage,
  onSetStatus,
  pendingTrend,
  onTrendConsumed,
  thread,
  workspaceId,
}: ConversationViewProps) => {
  const state = useConversationState({
    onTrendConsumed,
    pendingTrend,
    workspaceId,
  });

  const {
    applyProviderPreset,
    contentType,
    drafts,
    error,
    handleClearProvider,
    handleDeleteDraft,
    handleFocusLocalProvider,
    handleNewDraft,
    handleOpenCreditsCheckout,
    handleOpenProviderKeys,
    handleProjectLink,
    handleSaveDraft,
    handleSaveProvider,
    handleTestProvider,
    input,
    inputRef,
    isGenerating,
    isLoadingDrafts,
    isSavingProvider,
    isTestingProvider,
    messagesEndRef,
    persistDraft,
    platform,
    projects,
    providerApiKey,
    providerBaseUrl,
    providerConfig,
    providerKind,
    providerModel,
    providerStatus,
    publishIntent,
    selectedDraft,
    selectedDraftId,
    setContentType,
    setError,
    setInput,
    setIsGenerating,
    setPlatform,
    setProviderApiKey,
    setProviderBaseUrl,
    setProviderModel,
    setPublishIntent,
    setSelectedDraftId,
    workspace,
  } = state;

  const {
    handleFilesDropped,
    handleImportAssets,
    handleKeyDown,
    handlePublishGeneratedContent,
    handleSend,
  } = useConversationSend({
    contentType,
    input,
    isGenerating,
    onCreateThread,
    onSendMessage,
    onSetStatus,
    persistDraft,
    platform,
    publishIntent,
    selectedDraft,
    selectedDraftId,
    setError,
    setIsGenerating,
    thread,
    workspace,
    workspaceId,
  });

  return (
    <div className="conversation-view">
      <ConversationHeader
        error={error}
        isGenerating={isGenerating}
        onFocusLocalProvider={handleFocusLocalProvider}
        onOpenCreditsCheckout={handleOpenCreditsCheckout}
        onOpenProviderKeys={handleOpenProviderKeys}
        title={selectedDraft?.title ?? thread?.title ?? 'New Content Run'}
      />

      <div className="conversation-shell">
        <ConversationSidepanel
          drafts={drafts}
          isLoadingDrafts={isLoadingDrafts}
          isSavingProvider={isSavingProvider}
          isTestingProvider={isTestingProvider}
          onApplyProviderPreset={applyProviderPreset}
          onClearProvider={handleClearProvider}
          onDeleteDraft={handleDeleteDraft}
          onNewDraft={handleNewDraft}
          onProviderApiKeyChange={setProviderApiKey}
          onProviderBaseUrlChange={setProviderBaseUrl}
          onProviderModelChange={setProviderModel}
          onSaveProvider={handleSaveProvider}
          onSelectDraft={setSelectedDraftId}
          onTestProvider={handleTestProvider}
          providerApiKey={providerApiKey}
          providerBaseUrl={providerBaseUrl}
          providerConfig={providerConfig}
          providerKind={providerKind}
          providerModel={providerModel}
          providerStatus={providerStatus}
          selectedDraftId={selectedDraftId}
          workspaceId={workspaceId}
        />

        <section className="conversation-main">
          <ConversationComposerToolbar
            contentType={contentType}
            input={input}
            onContentTypeChange={
              setContentType as (v: DesktopContentType) => void
            }
            onImportAssets={handleImportAssets}
            onPlatformChange={
              setPlatform as (v: DesktopContentPlatform) => void
            }
            onProjectLink={handleProjectLink}
            onPublishIntentChange={
              setPublishIntent as (v: DesktopPublishIntent) => void
            }
            onSaveDraft={handleSaveDraft}
            platform={platform}
            projects={projects}
            publishIntent={publishIntent}
            workspace={workspace}
            workspaceId={workspaceId}
          />

          <DropZone
            className="conversation-messages"
            onFilesDropped={handleFilesDropped}
          >
            <ConversationMessages
              isGenerating={isGenerating}
              messagesEndRef={messagesEndRef}
              onPublishGeneratedContent={handlePublishGeneratedContent}
              selectedDraft={selectedDraft}
              thread={thread}
            />
          </DropZone>

          <ConversationInputBar
            input={input}
            isGenerating={isGenerating}
            onInputChange={setInput}
            onKeyDown={handleKeyDown}
            onSend={() => void handleSend()}
            platform={platform}
            textareaRef={inputRef}
            workspaceId={workspaceId}
          />
        </section>
      </div>
    </div>
  );
};
