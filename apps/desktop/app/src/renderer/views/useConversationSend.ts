import type {
  DesktopContentPlatform,
  DesktopContentType,
  DesktopPublishIntent,
  IDesktopContentRunDraft,
  IDesktopGeneratedContent,
  IDesktopMessage,
  IDesktopPublishResult,
  IDesktopThread,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';
import { useCallback } from 'react';

import { createId } from './useConversationState';

interface UseConversationSendParams {
  contentType: DesktopContentType;
  input: string;
  isGenerating: boolean;
  onCreateThread: () => IDesktopThread;
  onSendMessage: (threadId: string, message: IDesktopMessage) => void;
  onSetStatus: (threadId: string, status: 'awaiting-response' | 'idle') => void;
  persistDraft: (
    overrides?: Partial<IDesktopContentRunDraft>,
  ) => Promise<IDesktopContentRunDraft | null>;
  platform: DesktopContentPlatform;
  publishIntent: DesktopPublishIntent;
  selectedDraft: IDesktopContentRunDraft | null;
  selectedDraftId: string | null;
  setError: (error: string | null) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  thread: IDesktopThread | null;
  workspace: IDesktopWorkspace | null;
  workspaceId: string | null;
}

export function useConversationSend({
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
}: UseConversationSendParams) {
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
    [
      onCreateThread,
      onSendMessage,
      selectedDraftId,
      thread,
      workspaceId,
      setError,
    ],
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
  }, [importAssets, workspaceId, setError]);

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
        brief: savedDraft.brief,
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
    setIsGenerating,
    setError,
  ]);

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
    [importAssets, setError],
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

  return {
    handleFilesDropped,
    handleImportAssets,
    handleKeyDown,
    handlePublishGeneratedContent,
    handleSend,
  };
}
