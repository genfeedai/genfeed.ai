import type {
  DesktopContentPlatform,
  DesktopContentType,
  DesktopPublishIntent,
  IDesktopCloudProject,
  IDesktopContentRunDraft,
  IDesktopGeneratedContent,
  IDesktopMessage,
  IDesktopPublishResult,
  IDesktopThread,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { DropZone } from '@renderer/components/DropZone';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PLATFORM_OPTIONS: Array<{
  description: string;
  label: string;
  value: DesktopContentPlatform;
}> = [
  {
    description: 'Fast hooks and threads',
    label: 'Twitter/X',
    value: 'twitter',
  },
  { description: 'Short-form scripts', label: 'TikTok', value: 'tiktok' },
  {
    description: 'Captions and carousels',
    label: 'Instagram',
    value: 'instagram',
  },
  {
    description: 'Founder and GTM posts',
    label: 'LinkedIn',
    value: 'linkedin',
  },
  { description: 'Long-form video angles', label: 'YouTube', value: 'youtube' },
];

const TYPE_OPTIONS: Array<{
  label: string;
  value: DesktopContentType;
}> = [
  { label: 'Hook', value: 'hook' },
  { label: 'Thread', value: 'thread' },
  { label: 'Caption', value: 'caption' },
  { label: 'Script', value: 'script' },
  { label: 'Reply', value: 'reply' },
  { label: 'Article', value: 'article' },
];

const PUBLISH_INTENT_OPTIONS: Array<{
  label: string;
  value: DesktopPublishIntent;
}> = [
  { label: 'Save for review', value: 'review' },
  { label: 'Create as draft', value: 'draft' },
  { label: 'Publish after generate', value: 'publish' },
];

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

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeDate(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

const GeneratedContentCard = ({
  content,
  onPublish,
  publishResult,
}: {
  content: IDesktopGeneratedContent;
  onPublish: () => Promise<void>;
  publishResult?: IDesktopPublishResult;
}) => {
  const [copied, setCopied] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await onPublish();
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="generated-card">
      <div className="generated-card-header">
        <span className="platform-badge">{content.platform}</span>
        <span className="content-type-badge">{content.type}</span>
        {publishResult && (
          <span className="status-badge status-active">Published</span>
        )}
      </div>
      <pre className="generated-card-content">{content.content}</pre>
      {content.hooks && content.hooks.length > 0 && (
        <div className="generated-card-hooks">
          <span className="generated-card-hooks-label">Hook options:</span>
          <ol className="generated-hooks-list">
            {content.hooks.map((hook, index) => (
              <li key={`${content.id}-hook-${String(index)}`}>{hook}</li>
            ))}
          </ol>
        </div>
      )}
      {publishResult && (
        <div className="generated-card-publish-meta muted-text">
          Published to {publishResult.platform} at{' '}
          {formatTime(publishResult.publishedAt)}
        </div>
      )}
      <div className="generated-card-actions">
        <Button
          className="small"
          onClick={() => void handleCopy()}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </Button>
        <Button
          className="small"
          disabled={isPublishing || publishResult !== undefined}
          onClick={() => void handlePublish()}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          {publishResult
            ? 'Published'
            : isPublishing
              ? 'Publishing...'
              : '🚀 Publish'}
        </Button>
      </div>
    </div>
  );
};

const MessageBubble = ({
  message,
  onPublishGeneratedContent,
  publishResult,
}: {
  message: IDesktopMessage;
  onPublishGeneratedContent?: () => Promise<void>;
  publishResult?: IDesktopPublishResult;
}) => {
  const isUser = message.role === 'user';

  return (
    <div className={`message-row ${isUser ? 'message-user' : 'message-ai'}`}>
      {!isUser && <div className="message-avatar">G</div>}
      <div className={`message-bubble ${isUser ? 'bubble-user' : 'bubble-ai'}`}>
        <p className="message-text">{message.content}</p>
        {message.generatedContent && onPublishGeneratedContent && (
          <GeneratedContentCard
            content={message.generatedContent}
            onPublish={onPublishGeneratedContent}
            publishResult={publishResult}
          />
        )}
        <span className="message-time">{formatTime(message.createdAt)}</span>
      </div>
      {isUser && <div className="message-avatar user-avatar-bubble">U</div>}
    </div>
  );
};

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

      const fileNames = importedAssets.map(
        (value) => value.split('/').pop() ?? value,
      );
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
      <div className="conversation-header">
        <div>
          <h2 className="conversation-title">
            {selectedDraft?.title ?? thread?.title ?? 'New Content Run'}
          </h2>
          <p className="muted-text conversation-subtitle">
            Build a workspace-backed content run, then generate, publish, and
            iterate from one native surface.
          </p>
        </div>
        {isGenerating && (
          <span className="generating-badge">Generating...</span>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="conversation-shell">
        <aside className="conversation-sidepanel panel-card">
          <div className="conversation-panel-header">
            <h3>Saved Runs</h3>
            <Button
              className="small"
              onClick={() => {
                setSelectedDraftId(null);
                setInput('');
              }}
              type="button"
              variant={ButtonVariant.GHOST}
            >
              New
            </Button>
          </div>

          {!workspaceId && (
            <p className="empty-state compact">
              Open a workspace to create and persist content runs.
            </p>
          )}

          {workspaceId && isLoadingDrafts && (
            <p className="muted-text">Loading drafts...</p>
          )}

          {workspaceId && drafts.length === 0 && !isLoadingDrafts && (
            <p className="empty-state compact">
              No content runs yet. Save a draft or create one from a trend.
            </p>
          )}

          <div className="draft-list">
            {drafts.map((draft) => (
              <Button
                className={`draft-list-item ${
                  selectedDraftId === draft.id ? 'active' : ''
                }`}
                key={draft.id}
                onClick={() => setSelectedDraftId(draft.id)}
                type="button"
                variant={ButtonVariant.UNSTYLED}
              >
                <span className="draft-list-title">{draft.title}</span>
                <span className="draft-list-meta">
                  <span className={`status-badge status-${draft.status}`}>
                    {draft.status}
                  </span>
                  <span>{formatRelativeDate(draft.updatedAt)}</span>
                </span>
                <span className="draft-list-submeta">
                  {draft.platform} · {draft.type}
                </span>
                <span className="draft-list-actions">
                  <span>
                    {draft.sourceType === 'trend' ? 'Trend' : 'Prompt'}
                  </span>
                  <Button
                    aria-label={`Delete draft ${draft.title}`}
                    className="draft-list-delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteDraft(draft.id);
                    }}
                    type="button"
                    variant={ButtonVariant.GHOST}
                  >
                    ✕
                  </Button>
                </span>
              </Button>
            ))}
          </div>
        </aside>

        <section className="conversation-main">
          <div className="composer-toolbar panel-card">
            <div className="composer-control-group">
              <label className="composer-label" htmlFor="desktop-platform">
                Platform
              </label>
              <Select
                onValueChange={(value) =>
                  setPlatform(value as DesktopContentPlatform)
                }
                value={platform}
              >
                <SelectTrigger id="desktop-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="composer-control-group">
              <label className="composer-label" htmlFor="desktop-content-type">
                Output
              </label>
              <Select
                onValueChange={(value) =>
                  setContentType(value as DesktopContentType)
                }
                value={contentType}
              >
                <SelectTrigger id="desktop-content-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="composer-control-group">
              <label
                className="composer-label"
                htmlFor="desktop-publish-intent"
              >
                Intent
              </label>
              <Select
                onValueChange={(value) =>
                  setPublishIntent(value as DesktopPublishIntent)
                }
                value={publishIntent}
              >
                <SelectTrigger id="desktop-publish-intent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PUBLISH_INTENT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="composer-control-group composer-project-group">
              <label className="composer-label" htmlFor="desktop-project-link">
                Cloud project
              </label>
              <Select
                onValueChange={(value) => void handleProjectLink(value)}
                value={workspace?.linkedProjectId ?? ''}
              >
                <SelectTrigger id="desktop-project-link">
                  <SelectValue placeholder="Not linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Not linked</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="small"
              disabled={!workspaceId || !input.trim()}
              onClick={() => void handleSaveDraft()}
              type="button"
              variant={ButtonVariant.GHOST}
            >
              Save draft
            </Button>
            <Button
              className="small"
              disabled={!workspaceId}
              onClick={() => void handleImportAssets()}
              type="button"
              variant={ButtonVariant.GHOST}
            >
              Import assets
            </Button>
          </div>

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

          <div className="conversation-input-bar">
            <Textarea
              className="conversation-input"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the content run you want to execute... (⌘+Enter to send)"
              ref={inputRef}
              rows={3}
              value={input}
            />
            <div className="conversation-input-actions">
              <span className="muted-text">
                {PLATFORM_OPTIONS.find((option) => option.value === platform)
                  ?.description ?? 'Content generation'}
              </span>
              <Button
                className="send-button"
                disabled={!input.trim() || isGenerating || !workspaceId}
                onClick={() => void handleSend()}
                type="button"
                variant={ButtonVariant.DEFAULT}
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
