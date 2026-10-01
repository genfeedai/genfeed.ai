'use client';

import {
  type AgentApiService,
  type AgentThread,
  useAgentChatStore,
} from '@genfeedai/agent';
import { AgentThreadStatus } from '@genfeedai/contracts';
import type { AgentDockThreadOption } from '@props/ui/agent-dock.props';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const THREAD_LIST_LIMIT = 30;

function isListedThread(thread: AgentThread): boolean {
  return !thread.status || thread.status === AgentThreadStatus.ACTIVE;
}

function threadRecency(thread: AgentThread): string {
  return thread.updatedAt || thread.createdAt || '';
}

/**
 * Threads for the product-page chat box. The full `/agent` page owns its own
 * list; this only loads while the dock can open, then switches the shared
 * conversation store so the dock transcript follows.
 */
export function useAgentDockThreads(
  apiService: AgentApiService,
  isEnabled: boolean,
) {
  const threads = useAgentChatStore((state) => state.threads);
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const setThreads = useAgentChatStore((state) => state.setThreads);
  const setActiveThread = useAgentChatStore((state) => state.setActiveThread);
  const cacheConversation = useAgentChatStore(
    (state) => state.cacheConversation,
  );
  const restoreCachedConversation = useAgentChatStore(
    (state) => state.restoreCachedConversation,
  );
  const resetActiveConversationState = useAgentChatStore(
    (state) => state.resetActiveConversationState,
  );
  const setMessages = useAgentChatStore((state) => state.setMessages);
  const setWorkEvents = useAgentChatStore((state) => state.setWorkEvents);
  const setActiveRun = useAgentChatStore((state) => state.setActiveRun);
  const resetStreamState = useAgentChatStore((state) => state.resetStreamState);
  const setError = useAgentChatStore((state) => state.setError);
  const translate = useTranslations('common.agentDock');
  const [isThreadListLoading, setIsThreadListLoading] = useState(false);
  const requestSerial = useRef(0);

  useEffect(() => {
    if (!isEnabled || typeof apiService.getThreads !== 'function') {
      return;
    }

    const controller = new AbortController();
    setIsThreadListLoading(true);
    apiService
      .getThreads(
        { limit: THREAD_LIST_LIMIT, status: AgentThreadStatus.ACTIVE },
        controller.signal,
      )
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setThreads(loaded);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsThreadListLoading(false);
        }
      });

    return () => controller.abort();
  }, [apiService, isEnabled, setThreads]);

  const threadOptions = useMemo<readonly AgentDockThreadOption[]>(() => {
    return threads
      .filter(isListedThread)
      .sort((left, right) => {
        if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
          return left.isPinned ? -1 : 1;
        }
        return threadRecency(right).localeCompare(threadRecency(left));
      })
      .slice(0, THREAD_LIST_LIMIT)
      .map((thread) => ({
        id: thread.id,
        title: thread.title?.trim() || translate('untitledThread'),
      }));
  }, [threads, translate]);

  const selectThread = useCallback(
    async (threadId: string) => {
      const currentThreadId = useAgentChatStore.getState().activeThreadId;
      if (currentThreadId === threadId) {
        return;
      }

      const serial = ++requestSerial.current;
      if (currentThreadId) {
        cacheConversation(currentThreadId);
      }
      const restored = restoreCachedConversation(threadId);
      setActiveThread(threadId);
      if (restored) {
        return;
      }

      setMessages([]);
      setWorkEvents([]);
      setActiveRun(null);
      resetStreamState();

      try {
        const messages = await apiService.getMessages(threadId, { limit: 100 });
        if (
          serial !== requestSerial.current ||
          useAgentChatStore.getState().activeThreadId !== threadId
        ) {
          return;
        }
        setMessages(messages);
        setError(null);
      } catch {
        if (serial !== requestSerial.current) {
          return;
        }
        setError(translate('threadOpenFailed'));
      }
    },
    [
      apiService,
      cacheConversation,
      resetStreamState,
      restoreCachedConversation,
      setActiveRun,
      setActiveThread,
      setError,
      setMessages,
      setWorkEvents,
      translate,
    ],
  );

  const startThread = useCallback(() => {
    requestSerial.current += 1;
    const currentThreadId = useAgentChatStore.getState().activeThreadId;
    if (currentThreadId) {
      cacheConversation(currentThreadId);
    }
    setActiveThread(null);
    resetActiveConversationState();
  }, [cacheConversation, resetActiveConversationState, setActiveThread]);

  return {
    activeThreadId,
    isThreadListLoading,
    selectThread,
    startThread,
    threads: threadOptions,
  };
}
