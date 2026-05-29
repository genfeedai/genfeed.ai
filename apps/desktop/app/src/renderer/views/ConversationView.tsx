import type {
  DesktopContentPlatform,
  DesktopContentType,
  DesktopGenerationProviderKind,
  DesktopPublishIntent,
  IDesktopCloudProject,
  IDesktopContentRunDraft,
  IDesktopGeneratedContent,
  IDesktopGenerationProviderPublicConfig,
  IDesktopMessage,
  IDesktopPublishResult,
  IDesktopThread,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';
import { DropZone } from '@renderer/components/DropZone';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ConversationComposerToolbar } from './ConversationComposerToolbar';
import { ConversationHeader } from './ConversationHeader';
import { ConversationInputBar } from './ConversationInputBar';
import { MessageBubble } from './ConversationMessageBubble';
import { PROVIDER_PRESETS } from './ConversationProviderPresets';
import { ConversationSidepanel } from './ConversationSidepanel';

const CREDIT_CHECKOUT_PATH =
  '/onboarding/post-signup?credits=1000&source=desktop';
const PROVIDER_KEYS_PATH = '/settings/api-keys?source=desktop';

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildDraftTitle(prompt: string, type: DesktopContentType): string {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    return `Untitled ${type}`;
  }

  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

interface ConversationViewProps {
  onCreateThread: () => IDesktopThread;
  onSendMessage: (threadId: string, message: IDesktopMessage) => void;
  onSetStatus: (threadId: string, status: 'awaiting-response' | 'idle') => void;
  pendingTrend?: {
    id: string;
    platform: DesktopContentPlatform;
    topic: string;
  } | null;
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
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [projects, setProjects] = useState<IDesktopCloudProject[]>([]);
  const [workspace, setWorkspace] = useState<IDesktopWorkspace | null>(null);
  const [drafts, setDrafts] = useState<IDesktopContentRunDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<DesktopContentPlatform>('twitter');
  const [contentType, setContentType] = useState<DesktopContentType>('hook');
  const [publishIntent, setPublishIntent] =
    useState<DesktopPublishIntent>('review');
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [providerConfig, setProviderConfig] =
    useState<IDesktopGenerationProviderPublicConfig | null>(null);
  const [providerKind, setProviderKind] =
    useState<DesktopGenerationProviderKind>('ollama');
  const [providerBaseUrl, setProviderBaseUrl] = useState(
    PROVIDER_PRESETS.ollama.baseUrl,
  );
  const [providerModel, setProviderModel] = useState(
    PROVIDER_PRESETS.ollama.model,
  );
  const [providerApiKey, setProviderApiKey] = useState('');
  const [providerDisplayName, setProviderDisplayName] = useState(
    PROVIDER_PRESETS.ollama.displayName,
  );
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId],
  );

  const loadWorkspaceContext = useCallback(async () => {
    if (!workspaceId) {
      setWorkspace(null);
      setProjects([]);
      setDrafts([]);
      setSelectedDraftId(null);
      return;
    }

    setIsLoadingDrafts(true);

    try {
      const [nextWorkspace, nextProjects, nextDrafts] = await Promise.all([
        window.genfeedDesktop.workspace.readWorkspace(workspaceId),
        window.genfeedDesktop.cloud.listProjects(),
        window.genfeedDesktop.drafts.list(workspaceId),
      ]);

      setWorkspace(nextWorkspace);
      setProjects(nextProjects);
      setDrafts(nextDrafts);
      if (nextDrafts.length > 0 && !selectedDraftId) {
        setSelectedDraftId(nextDrafts[0].id);
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to load workspace context.',
      );
    } finally {
      setIsLoadingDrafts(false);
    }
  }, [selectedDraftId, workspaceId]);

  useEffect(() => {
    void loadWorkspaceContext();
  }, [loadWorkspaceContext]);

  const loadProviderConfig = useCallback(async () => {
    const nextConfig =
      await window.genfeedDesktop.generation.getProviderConfig();
    setProviderConfig(nextConfig);

    if (!nextConfig) {
      return;
    }

    setProviderKind(nextConfig.provider);
    setProviderBaseUrl(nextConfig.baseUrl);
    setProviderModel(nextConfig.model);
    setProviderDisplayName(
      nextConfig.displayName ??
        PROVIDER_PRESETS[nextConfig.provider].displayName,
    );
  }, []);

  useEffect(() => {
    void loadProviderConfig().catch((nextError: unknown) => {
      setProviderStatus(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to load local provider.',
      );
    });
  }, [loadProviderConfig]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'g') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!selectedDraft) {
      return;
    }

    setInput(selectedDraft.prompt);
    setPlatform(selectedDraft.platform);
    setContentType(selectedDraft.type);
    setPublishIntent(selectedDraft.publishIntent);
  }, [selectedDraft]);

  useEffect(() => {
    if (!pendingTrend || !workspaceId) {
      return;
    }

    const nextDraft: IDesktopContentRunDraft = {
      createdAt: new Date().toISOString(),
      id: createId(),
      platform: pendingTrend.platform,
      prompt: `Create a ${pendingTrend.platform} ${contentType} from trend: ${pendingTrend.topic}`,
      publishIntent: 'review',
      sourceTrendId: pendingTrend.id,
      sourceTrendTopic: pendingTrend.topic,
      sourceType: 'trend',
      status: 'draft',
      title: buildDraftTitle(pendingTrend.topic, contentType),
      type: contentType,
      updatedAt: new Date().toISOString(),
      workspaceId,
    };

    void window.genfeedDesktop.drafts
      .save(workspaceId, nextDraft)
      .then(async (savedDraft) => {
        setDrafts((prev) => [savedDraft, ...prev]);
        setSelectedDraftId(savedDraft.id);
        setInput(savedDraft.prompt);
        setPlatform(savedDraft.platform);
        setPublishIntent(savedDraft.publishIntent);
        onTrendConsumed?.();
      })
      .catch((nextError: unknown) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to create draft from trend.',
        );
      });
  }, [contentType, onTrendConsumed, pendingTrend, workspaceId]);

  const persistDraft = useCallback(
    async (
      overrides?: Partial<IDesktopContentRunDraft>,
    ): Promise<IDesktopContentRunDraft | null> => {
      if (!workspaceId) {
        setError('Open a workspace before creating content runs.');
        return null;
      }

      const now = new Date().toISOString();
      const draft: IDesktopContentRunDraft = {
        createdAt: selectedDraft?.createdAt ?? now,
        id: selectedDraft?.id ?? createId(),
        platform,
        projectId: workspace?.linkedProjectId,
        prompt: input.trim(),
        publishIntent,
        sourceType: selectedDraft?.sourceType ?? 'prompt',
        status: selectedDraft?.status ?? 'draft',
        title: buildDraftTitle(input, contentType),
        type: contentType,
        updatedAt: now,
        workspaceId,
        ...selectedDraft,
        ...overrides,
      };

      const savedDraft = await window.genfeedDesktop.drafts.save(
        workspaceId,
        draft,
      );
      const nextDrafts = await window.genfeedDesktop.drafts.list(workspaceId);
      setDrafts(nextDrafts);
      setSelectedDraftId(savedDraft.id);
      return savedDraft;
    },
    [
      contentType,
      input,
      platform,
      publishIntent,
      selectedDraft,
      workspace,
      workspaceId,
    ],
  );

  const handleSaveDraft = useCallback(async () => {
    if (!input.trim()) {
      setError('Add a prompt before saving a content run.');
      return;
    }

    setError(null);
    try {
      await persistDraft();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to save draft.',
      );
    }
  }, [input, persistDraft]);

  const handleDeleteDraft = useCallback(
    async (draftId: string) => {
      if (!workspaceId) {
        return;
      }

      await window.genfeedDesktop.drafts.delete(workspaceId, draftId);
      const nextDrafts = await window.genfeedDesktop.drafts.list(workspaceId);
      setDrafts(nextDrafts);
      if (selectedDraftId === draftId) {
        setSelectedDraftId(nextDrafts[0]?.id ?? null);
        if (nextDrafts.length === 0) {
          setInput('');
        }
      }
    },
    [selectedDraftId, workspaceId],
  );

  const handleProjectLink = useCallback(
    async (projectId: string) => {
      if (!workspaceId) {
        return;
      }

      if (!projectId) {
        setWorkspace((prev) =>
          prev ? { ...prev, linkedProjectId: undefined } : prev,
        );
        return;
      }

      const nextWorkspace = await window.genfeedDesktop.workspace.linkProject(
        workspaceId,
        projectId,
      );
      setWorkspace(nextWorkspace);
    },
    [workspaceId],
  );

  const applyProviderPreset = useCallback(
    (nextProviderKind: DesktopGenerationProviderKind) => {
      const preset = PROVIDER_PRESETS[nextProviderKind];
      setProviderKind(nextProviderKind);
      setProviderBaseUrl(preset.baseUrl);
      setProviderModel(preset.model);
      setProviderDisplayName(preset.displayName);
      setProviderStatus(null);
    },
    [],
  );

  const buildProviderPayload = useCallback(
    () => ({
      ...(providerApiKey.trim()
        ? {
            apiKey: providerApiKey.trim(),
          }
        : {}),
      baseUrl: providerBaseUrl.trim(),
      displayName: providerDisplayName.trim() || undefined,
      model: providerModel.trim(),
      provider: providerKind,
    }),
    [
      providerApiKey,
      providerBaseUrl,
      providerDisplayName,
      providerKind,
      providerModel,
    ],
  );

  const handleSaveProvider = useCallback(async () => {
    setIsSavingProvider(true);
    setProviderStatus(null);

    try {
      const savedConfig =
        await window.genfeedDesktop.generation.saveProviderConfig(
          buildProviderPayload(),
        );
      setProviderConfig(savedConfig);
      setProviderApiKey('');
      setProviderStatus(
        `Using ${savedConfig.displayName ?? savedConfig.model}.`,
      );
    } catch (nextError) {
      setProviderStatus(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to save local provider.',
      );
    } finally {
      setIsSavingProvider(false);
    }
  }, [buildProviderPayload]);

  const handleTestProvider = useCallback(async () => {
    setIsTestingProvider(true);
    setProviderStatus(null);

    try {
      const result = await window.genfeedDesktop.generation.testProviderConfig(
        buildProviderPayload(),
      );
      setProviderStatus(`Connected in ${String(result.latencyMs)}ms.`);
    } catch (nextError) {
      setProviderStatus(
        nextError instanceof Error
          ? nextError.message
          : 'Local provider test failed.',
      );
    } finally {
      setIsTestingProvider(false);
    }
  }, [buildProviderPayload]);

  const handleClearProvider = useCallback(async () => {
    await window.genfeedDesktop.generation.clearProviderConfig();
    setProviderConfig(null);
    setProviderApiKey('');
    setProviderStatus('Local provider cleared.');
  }, []);

  const handleOpenCreditsCheckout = useCallback(async () => {
    await window.genfeedDesktop.app.openExternalPath(CREDIT_CHECKOUT_PATH);
  }, []);

  const handleOpenProviderKeys = useCallback(async () => {
    await window.genfeedDesktop.app.openExternalPath(PROVIDER_KEYS_PATH);
  }, []);

  const handleFocusLocalProvider = useCallback(() => {
    document
      .getElementById('desktop-provider-panel')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handlePublishGeneratedContent = useCallback(async () => {
    if (!selectedDraft?.generatedContent) {
      return;
    }

    const publishResult = await window.genfeedDesktop.cloud.publishPost({
      content: selectedDraft.generatedContent.content,
      draftId: selectedDraft.generatedContent.id,
      platform: selectedDraft.generatedContent.platform,
    });

    await persistDraft({
      publishIntent: 'publish',
      publishResult,
      status: 'published',
    });
    await window.genfeedDesktop.notifications.notify(
      'Published',
      `Content published to ${publishResult.platform}.`,
    );
  }, [persistDraft, selectedDraft]);

  const importAssets = useCallback(
    async (paths: string[]) => {
      if (!workspaceId) {
        setError('Open a workspace before attaching assets.');
        return;
      }

      const importedAssets = await window.genfeedDesktop.files.importAssets(
        workspaceId,
        paths,
      );

      let currentThread = thread;
      if (!currentThread) {
        currentThread = onCreateThread();
      }

      const fileNames = importedAssets.map((asset) => asset.displayName);
      const message: IDesktopMessage = {
        content: `[Imported assets: ${fileNames.join(', ')}]`,
        createdAt: new Date().toISOString(),
        draftId: selectedDraftId ?? undefined,
        id: createId(),
        role: 'user',
      };

      onSendMessage(currentThread.id, message);
    },
    [onCreateThread, onSendMessage, selectedDraftId, thread, workspaceId],
  );

  const handleImportAssets = useCallback(async () => {
    if (!workspaceId) {
      setError('Open a workspace before importing assets.');
      return;
    }

    const result = await window.genfeedDesktop.files.openFileDialog();
    if (result.canceled || result.filePaths.length === 0) {
      return;
    }

    try {
      setError(null);
      await importAssets(result.filePaths);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to import assets.',
      );
    }
  }, [importAssets, workspaceId]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isGenerating) {
      return;
    }

    if (!workspaceId) {
      setError('Open a workspace before generating content.');
      return;
    }

    setError(null);

    let currentThread = thread;
    if (!currentThread) {
      currentThread = onCreateThread();
    }

    const savedDraft = await persistDraft();
    if (!savedDraft) {
      return;
    }

    const userMessage: IDesktopMessage = {
      content: input.trim(),
      createdAt: new Date().toISOString(),
      draftId: savedDraft.id,
      id: createId(),
      role: 'user',
    };

    onSendMessage(currentThread.id, userMessage);
    onSetStatus(currentThread.id, 'awaiting-response');
    setIsGenerating(true);

    try {
      const generated = await window.genfeedDesktop.cloud.generateContent({
        platform,
        projectId: workspace?.linkedProjectId,
        prompt: input.trim(),
        publishIntent,
        sourceDraftId: savedDraft.id,
        sourceTrendId: savedDraft.sourceTrendId,
        sourceTrendTopic: savedDraft.sourceTrendTopic,
        type: contentType,
      });

      let hooks: string[] = [];
      try {
        hooks = await window.genfeedDesktop.cloud.generateHooks(input.trim());
      } catch {
        hooks = generated.hooks ?? [];
      }

      let publishResult: IDesktopPublishResult | undefined;
      if (publishIntent === 'publish') {
        publishResult = await window.genfeedDesktop.cloud.publishPost({
          content: generated.content,
          draftId: generated.id,
          platform: generated.platform,
        });
      }

      const nextGeneratedContent: IDesktopGeneratedContent = {
        ...generated,
        hooks: hooks.length > 0 ? hooks : generated.hooks,
      };

      const aiMessage: IDesktopMessage = {
        content: nextGeneratedContent.content,
        createdAt: new Date().toISOString(),
        draftId: savedDraft.id,
        generatedContent: nextGeneratedContent,
        id: createId(),
        role: 'assistant',
      };

      onSendMessage(currentThread.id, aiMessage);
      onSetStatus(currentThread.id, 'idle');

      await persistDraft({
        generatedContent: nextGeneratedContent,
        publishResult,
        status: publishResult ? 'published' : 'generated',
      });

      if (publishResult) {
        await window.genfeedDesktop.notifications.notify(
          'Published',
          `Content published to ${publishResult.platform}.`,
        );
      }
    } catch (nextError) {
      const errorMessage: IDesktopMessage = {
        content: `Generation failed: ${nextError instanceof Error ? nextError.message : 'Unknown error'}.`,
        createdAt: new Date().toISOString(),
        draftId: savedDraft.id,
        id: createId(),
        role: 'assistant',
      };
      onSendMessage(currentThread.id, errorMessage);
      onSetStatus(currentThread.id, 'idle');
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Generation failed unexpectedly.',
      );
    } finally {
      setIsGenerating(false);
    }
  }, [
    contentType,
    input,
    isGenerating,
    onCreateThread,
    onSendMessage,
    onSetStatus,
    persistDraft,
    platform,
    publishIntent,
    thread,
    workspace,
    workspaceId,
  ]);

  const handleFilesDropped = useCallback(
    (paths: string[]) => {
      void importAssets(paths).catch((nextError: unknown) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to import dropped assets.',
        );
      });
    },
    [importAssets],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

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
          onNewDraft={() => {
            setSelectedDraftId(null);
            setInput('');
          }}
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
            onContentTypeChange={setContentType}
            onImportAssets={handleImportAssets}
            onPlatformChange={setPlatform}
            onProjectLink={handleProjectLink}
            onPublishIntentChange={setPublishIntent}
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
            {(!thread || thread.messages.length === 0) && !isGenerating && (
              <div className="conversation-empty">
                <div className="empty-logo">G</div>
                <h3>What do you want to create?</h3>
                <p className="muted-text">
                  Choose a platform, set the output type, save a draft, and run
                  the loop from prompt to publish.
                </p>
              </div>
            )}

            {thread?.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onPublishGeneratedContent={
                  message.generatedContent
                    ? handlePublishGeneratedContent
                    : undefined
                }
                publishResult={selectedDraft?.publishResult}
              />
            ))}

            {isGenerating && (
              <div className="message-row message-ai">
                <div className="message-avatar">G</div>
                <div className="message-bubble bubble-ai typing-indicator">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
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
