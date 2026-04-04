import { useCallback } from 'react';

import type { ChatMessage } from '~models/chat.model';
import { useBrandStore } from '~store/use-brand-store';
import { useChatStore } from '~store/use-chat-store';
import { usePlatformStore } from '~store/use-platform-store';
import { logger } from '~utils/logger.util';

interface UseChatReturn {
  sendMessage: (content: string) => void;
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
    (content: string) => {
      const userMessage: ChatMessage = {
        content,
        createdAt: new Date().toISOString(),
        id: `user-${Date.now()}`,
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

      ensureThread
        .then((threadId) => {
          chrome.runtime.sendMessage(
            {
              event: 'chatSendMessage',
              payload: {
                brandId: activeBrandId,
                content,
                pageContext,
                platform: currentPlatform,
                threadId,
              },
            },
            (response) => {
              setIsGenerating(false);
              if (response?.success && response.message) {
                const assistantMessage: ChatMessage = {
                  content: response.message.content,
                  createdAt:
                    response.message.createdAt ?? new Date().toISOString(),
                  id: response.message.id ?? `assistant-${Date.now()}`,
                  metadata: response.message.metadata,
                  role: 'assistant',
                  threadId,
                };
                addMessage(assistantMessage);
              } else {
                setError(response?.error ?? 'Failed to generate response');
              }
            },
          );
        })
        .catch((err) => {
          setIsGenerating(false);
          setError(
            err instanceof Error ? err.message : 'Failed to create thread',
          );
          logger.error('Failed to send message', err);
        });
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
