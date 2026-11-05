'use client';

import {
  type AgentApiService,
  type AgentThread,
  useAgentChatStore,
} from '@genfeedai/agent';
import { AgentThreadKind, AgentThreadStatus } from '@genfeedai/contracts';
import type { AgentDockThreadOption } from '@props/ui/agent-dock.props';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  forgetThreadId,
  readRememberedThreadId,
  rememberThreadId,
} from './agent-dock-thread-keys';

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
 *
 * A page about one record passes its `threadKey` (e.g. `post:<id>`): the dock
 * then holds that record's own conversation, never the master.
 */
export function useAgentDockThreads(
  apiService: Pick<AgentApiService, 'getMessages' | 'getThreads'> &
    Partial<Pick<AgentApiService, 'getMasterThread'>>,
  isEnabled: boolean,
  // False where the page opens the master itself (the `/agent` workspace).
  shouldOpenMaster = true,
  threadKey: string | null = null,
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
  // Set when the operator starts a blank conversation, so opening the master by
  // default does not undo it. Cleared when the dock stops being the host.
  const hasStartedFreshThread = useRef(false);
  // The record whose conversation the dock currently holds.
  const openedThreadKey = useRef<string | null>(null);

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
        // The master is the dock's home: it leads the list, then pinned.
        const isLeftMaster = left.kind === AgentThreadKind.MASTER;
        const isRightMaster = right.kind === AgentThreadKind.MASTER;
        if (isLeftMaster !== isRightMaster) {
          return isLeftMaster ? -1 : 1;
        }
        if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
          return left.isPinned ? -1 : 1;
        }
        return threadRecency(right).localeCompare(threadRecency(left));
      })
      .slice(0, THREAD_LIST_LIMIT)
      .map((thread) => ({
        id: thread.id,
        title:
          thread.kind === AgentThreadKind.MASTER
            ? translate('masterThread')
            : thread.title?.trim() || translate('untitledThread'),
      }));
  }, [threads, translate]);

  const selectThread = useCallback(
    async (threadId: string): Promise<boolean> => {
      const currentThreadId = useAgentChatStore.getState().activeThreadId;
      if (currentThreadId === threadId) {
        return true;
      }

      const serial = ++requestSerial.current;
      if (currentThreadId) {
        cacheConversation(currentThreadId);
      }
      const restored = restoreCachedConversation(threadId);
      setActiveThread(threadId);
      if (restored) {
        return true;
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
          return true;
        }
        setMessages(messages);
        setError(null);
        return true;
      } catch {
        if (serial !== requestSerial.current) {
          return true;
        }
        setError(translate('threadOpenFailed'));
        return false;
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
    hasStartedFreshThread.current = true;
    setActiveThread(null);
    resetActiveConversationState();
  }, [cacheConversation, resetActiveConversationState, setActiveThread]);

  // A record page holds the record's own conversation: the thread the dock
  // last held for it, else a fresh one that the first message creates.
  useEffect(() => {
    if (!isEnabled || !threadKey) {
      if (openedThreadKey.current) {
        openedThreadKey.current = null;
        // Leaving the record without a conversation lets the master return.
        if (!useAgentChatStore.getState().activeThreadId) {
          hasStartedFreshThread.current = false;
        }
      }
      return;
    }
    if (openedThreadKey.current === threadKey) {
      return;
    }

    openedThreadKey.current = threadKey;
    const rememberedThreadId = readRememberedThreadId(threadKey);
    if (!rememberedThreadId) {
      startThread();
      return;
    }

    void selectThread(rememberedThreadId).then((isOpened) => {
      if (isOpened || openedThreadKey.current !== threadKey) {
        return;
      }
      // The thread is gone (archived, deleted): start the record over.
      forgetThreadId(threadKey);
      setError(null);
      startThread();
    });
  }, [isEnabled, selectThread, setError, startThread, threadKey]);

  // The first message on a record's fresh conversation creates its thread;
  // remember it so the record reopens it next time.
  useEffect(() => {
    // Read the store, not this render: opening the record above may have
    // switched the thread in the same commit.
    const { activeThreadId: currentThreadId, threads: currentThreads } =
      useAgentChatStore.getState();
    if (
      !isEnabled ||
      !threadKey ||
      !activeThreadId ||
      !currentThreadId ||
      openedThreadKey.current !== threadKey ||
      readRememberedThreadId(threadKey) === currentThreadId
    ) {
      return;
    }
    const currentThread = currentThreads.find(
      (thread) => thread.id === currentThreadId,
    );
    if (currentThread?.kind === AgentThreadKind.MASTER) {
      return;
    }
    rememberThreadId(threadKey, currentThreadId);
  }, [activeThreadId, isEnabled, threadKey]);

  // The dock opens on the master conversation unless a thread is already open,
  // the operator asked for a blank one, or the page holds a record's thread.
  useEffect(() => {
    if (!isEnabled) {
      hasStartedFreshThread.current = false;
      return;
    }
    if (
      threadKey ||
      !shouldOpenMaster ||
      activeThreadId ||
      hasStartedFreshThread.current ||
      typeof apiService.getMasterThread !== 'function'
    ) {
      return;
    }

    const controller = new AbortController();
    apiService
      .getMasterThread(controller.signal)
      .then((master) => {
        if (
          controller.signal.aborted ||
          hasStartedFreshThread.current ||
          useAgentChatStore.getState().activeThreadId
        ) {
          return;
        }
        const { threads: current, setThreads: replaceThreads } =
          useAgentChatStore.getState();
        if (!current.some((thread) => thread.id === master.id)) {
          replaceThreads([master, ...current]);
        }
        return selectThread(master.id);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [
    activeThreadId,
    apiService,
    isEnabled,
    selectThread,
    shouldOpenMaster,
    threadKey,
  ]);

  return {
    activeThreadId,
    isThreadListLoading,
    selectThread,
    startThread,
    threads: threadOptions,
  };
}
