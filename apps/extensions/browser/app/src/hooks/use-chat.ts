import type { AgentArtifactReference } from '@genfeedai/contracts/interfaces';
import { useCallback } from 'react';
import type { ChatMessage } from '~models/chat.model';
import { getWorkspaceState } from '~services/workspace.service';
import { useBrandStore } from '~store/use-brand-store';
import { useChatStore } from '~store/use-chat-store';
import { usePlatformStore } from '~store/use-platform-store';
import { logger } from '~utils/logger.util';

interface UseChatReturn {
  sendMessage: (
    content: string,
    artifactReferences?: AgentArtifactReference[],
    displayContent?: string,
  ) => Promise<boolean>;
}

export function useChat(): UseChatReturn {
  const addMessage = useChatStore((s) => s.addMessage);
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const setIsGenerating = useChatStore((s) => s.setIsGenerating);
  const setError = useChatStore((s) => s.setError);
  const currentPlatform = usePlatformStore((s) => s.currentPlatform);
  const pageContext = usePlatformStore((s) => s.pageContext);
  const activeBrandId = useBrandStore((s) => s.activeBrandId);

  const sendMessage = useCallback(
    async (
      content: string,
      artifactReferences?: AgentArtifactReference[],
      displayContent = content,
    ) => {
      const expected = getWorkspaceState();
      if (
        expected.status !== 'ready' ||
        expected.snapshot.brandId !== activeBrandId
      )
        return false;
      const isSameScope = () => {
        const current = getWorkspaceState();
        return (
          (current.status === 'ready' || current.status === 'refreshing') &&
          current.snapshot.revision === expected.snapshot.revision &&
          current.snapshot.userId === expected.snapshot.userId &&
          current.snapshot.organizationId ===
            expected.snapshot.organizationId &&
          current.snapshot.brandId === expected.snapshot.brandId
        );
      };
      const isCurrent = () =>
        getWorkspaceState().status === 'ready' && isSameScope();
      if (!activeBrandId || useChatStore.getState().isGenerating) return false;
      const userMessage: ChatMessage = {
        content: displayContent,
        createdAt: new Date().toISOString(),
        id: `user-${Date.now()}`,
        metadata: artifactReferences?.length
          ? { artifactReferences }
          : undefined,
        role: 'user',
        threadId: activeThreadId ?? '',
      };

      addMessage(userMessage);
      setIsGenerating(true);
      setError(null);

      const ensureThread = activeThreadId
        ? Promise.resolve(activeThreadId)
        : new Promise<string>((resolve, reject) => {
            chrome.runtime.sendMessage(
              {
                event: 'chatCreateThread',
                payload: {
                  brandId: activeBrandId,
                  platform: currentPlatform,
                  title: content.substring(0, 100),
                },
              },
              (response) => {
                if (response?.success && response.threadId) {
                  if (
                    isCurrent() &&
                    useBrandStore.getState().activeBrandId === activeBrandId
                  )
                    setActiveThread(response.threadId);
                  resolve(response.threadId);
                } else {
                  reject(
                    new Error(response?.error ?? 'Failed to create thread'),
                  );
                }
              },
            );
          });

      try {
        const threadId = await ensureThread;
        if (
          !isCurrent() ||
          useBrandStore.getState().activeBrandId !== activeBrandId
        )
          return false;
        const response = await new Promise<{
          success?: boolean;
          error?: string;
          message?: ChatMessage;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              event: 'chatSendMessage',
              payload: {
                artifactReferences,
                brandId: activeBrandId,
                content,
                pageContext,
                platform: currentPlatform,
                threadId,
              },
            },
            resolve,
          );
        });
        if (!response?.success || !response.message)
          throw new Error(response?.error ?? 'Failed to generate response');
        if (
          !isCurrent() ||
          useBrandStore.getState().activeBrandId !== activeBrandId ||
          useChatStore.getState().activeThreadId !== threadId
        )
          return false;
        addMessage({
          ...response.message,
          createdAt: response.message.createdAt ?? new Date().toISOString(),
          id: response.message.id ?? `assistant-${Date.now()}`,
          role: 'assistant',
          threadId,
        });
        return true;
      } catch (err) {
        if (!isCurrent()) return false;
        setError(err instanceof Error ? err.message : 'Failed to send message');
        logger.error('Failed to send message', err);
        return false;
      } finally {
        if (isSameScope()) setIsGenerating(false);
      }
    },
    [
      activeThreadId,
      currentPlatform,
      activeBrandId,
      pageContext,
      addMessage,
      setActiveThread,
      setIsGenerating,
      setError,
    ],
  );

  return { sendMessage };
}
