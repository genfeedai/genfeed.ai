import type {
  DesktopContentPlatform,
  DesktopContentType,
  DesktopGenerationProviderKind,
  DesktopPublishIntent,
  IDesktopCloudProject,
  IDesktopContentRunDraft,
  IDesktopGenerationProviderPublicConfig,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PROVIDER_PRESETS } from './ConversationProviderPresets';

const CREDIT_CHECKOUT_PATH =
  '/onboarding/post-signup?credits=1000&source=desktop';
const PROVIDER_KEYS_PATH = '/settings/api-keys?source=desktop';

export function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildDraftTitle(
  prompt: string,
  type: DesktopContentType,
): string {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    return `Untitled ${type}`;
  }

  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

type BuildPersistedContentRunDraftParams = {
  contentType: DesktopContentType;
  input: string;
  now: string;
  overrides?: Partial<IDesktopContentRunDraft>;
  platform: DesktopContentPlatform;
  publishIntent: DesktopPublishIntent;
  selectedDraft: IDesktopContentRunDraft | null;
  workspace: IDesktopWorkspace | null;
  workspaceId: string;
};

export function buildPersistedContentRunDraft({
  contentType,
  input,
  now,
  overrides,
  platform,
  publishIntent,
  selectedDraft,
  workspace,
  workspaceId,
}: BuildPersistedContentRunDraftParams): IDesktopContentRunDraft {
  return {
    ...selectedDraft,
    createdAt: selectedDraft?.createdAt ?? now,
    id: selectedDraft?.id ?? createId(),
    platform,
    projectId: workspace ? workspace.linkedProjectId : selectedDraft?.projectId,
    prompt: input.trim(),
    publishIntent,
    sourceType: selectedDraft?.sourceType ?? 'prompt',
    status: selectedDraft?.status ?? 'draft',
    title: buildDraftTitle(input, contentType),
    type: contentType,
    updatedAt: now,
    workspaceId,
    ...overrides,
  };
}

interface UseConversationStateParams {
  workspaceId: string | null;
  pendingTrend?: {
    id: string;
    platform: DesktopContentPlatform;
    topic: string;
  } | null;
  onTrendConsumed?: () => void;
}

export function useConversationState({
  workspaceId,
  pendingTrend,
  onTrendConsumed,
}: UseConversationStateParams) {
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
        setContentType(savedDraft.type);
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
      const draft = buildPersistedContentRunDraft({
        contentType,
        input,
        now,
        overrides,
        platform,
        publishIntent,
        selectedDraft,
        workspace,
        workspaceId,
      });

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

  const handleNewDraft = useCallback(() => {
    setSelectedDraftId(null);
    setInput('');
  }, []);

  return {
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
    workspaceId,
  };
}
