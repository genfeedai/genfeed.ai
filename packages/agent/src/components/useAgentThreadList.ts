import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { APP_ROUTES } from '@genfeedai/constants';
import { AgentThreadStatus } from '@genfeedai/enums';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AGENT_REFRESH_CONVERSATIONS_EVENT,
  getErrorMessage,
  hasRenderableThreadId,
  isAuthError,
  sortThreads,
} from './agent-thread-list.helpers';

const AUTH_REQUIRED_MESSAGE =
  'Authentication required. Refresh the page or sign in again.';
const CONVERSATION_LIMIT = 50;

interface UseAgentThreadListParams {
  apiService: AgentApiService;
  isActive: boolean;
  /**
   * When set, conversations are hard-filtered to this brand. When null/undefined,
   * the list is full org (brand dropdown cleared).
   */
  brandId?: string | null;
  onNavigate?: (path: string) => void;
}

export function useAgentThreadList({
  apiService,
  isActive,
  brandId = null,
  onNavigate,
}: UseAgentThreadListParams) {
  const threads = useAgentChatStore((s) => s.threads);
  const setThreads = useAgentChatStore((s) => s.setThreads);
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const activeRunStatus = useAgentChatStore((s) => s.activeRunStatus);
  const threadUiBusyById = useAgentChatStore((s) => s.threadUiBusyById);
  const setActiveThread = useAgentChatStore((s) => s.setActiveThread);
  const setError = useAgentChatStore((s) => s.setError);
  const clearMessages = useAgentChatStore((s) => s.clearMessages);
  const clearThreadAttention = useAgentChatStore((s) => s.clearThreadAttention);
  const setMessages = useAgentChatStore((s) => s.setMessages);
  const setThreadPrompt = useAgentChatStore((s) => s.setThreadPrompt);
  const setActiveRun = useAgentChatStore((s) => s.setActiveRun);
  const setWorkEvents = useAgentChatStore((s) => s.setWorkEvents);
  const resetStreamState = useAgentChatStore((s) => s.resetStreamState);
  const isStreaming = useAgentChatStore((s) => s.stream.isStreaming);

  const [isLoading, setIsLoading] = useState(false);
  // Bumped after every successful/failed load so soft refreshes still re-render
  // even when isLoading stays false (store mocks and no-op setState edge cases).
  const [, setListRevision] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewStatus, setViewStatus] = useState<AgentThreadStatus>(
    AgentThreadStatus.ACTIVE,
  );
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const previousBrandIdRef = useRef(brandId);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const getThreadHref = useCallback(
    (threadId: string) => `${APP_ROUTES.AGENT.ROOT}/${threadId}`,
    [],
  );
  const getNewThreadHref = useCallback(() => APP_ROUTES.AGENT.NEW, []);

  useEffect(() => {
    if (renamingThreadId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingThreadId]);

  const loadThreads = useCallback(async (): Promise<boolean> => {
    if (!isActive) {
      return true;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    // Only flip loading when the store is empty so thread switches / soft
    // refreshes do not replace the list with a spinner.
    const hasExistingThreads = useAgentChatStore.getState().threads.length > 0;
    if (!hasExistingThreads) {
      setIsLoading(true);
    }
    try {
      const data = await runAgentApiEffect(
        apiService.getThreadsEffect(
          {
            limit: CONVERSATION_LIMIT,
            status: viewStatus,
            brandId: brandId || undefined,
          },
          abortRef.current.signal,
        ),
      );
      setAuthError(null);
      setLoadError(null);
      const matchesBrandScope = (thread: {
        brandId?: string | null;
      }): boolean => !brandId || thread.brandId === brandId;
      const renderableData = data.filter(
        (thread) => hasRenderableThreadId(thread) && matchesBrandScope(thread),
      );
      const { threads: current, activeThreadId: currentActiveId } =
        useAgentChatStore.getState();
      const renderableCurrent = current.filter(
        (thread) => hasRenderableThreadId(thread) && matchesBrandScope(thread),
      );
      const apiIds = new Set(renderableData.map((item) => item.id));

      const activeThread =
        currentActiveId && !apiIds.has(currentActiveId)
          ? renderableCurrent.find((t) => t.id === currentActiveId)
          : null;

      const RECENT_THRESHOLD_MS = 15_000;
      const now = Date.now();
      const recentLocalThreads =
        viewStatus === AgentThreadStatus.ACTIVE
          ? renderableCurrent.filter(
              (thread) =>
                !apiIds.has(thread.id) &&
                thread.id !== currentActiveId &&
                thread.createdAt &&
                now - new Date(thread.createdAt).getTime() <
                  RECENT_THRESHOLD_MS,
            )
          : [];

      const preserved = activeThread
        ? [activeThread, ...recentLocalThreads]
        : recentLocalThreads;
      setThreads(sortThreads([...preserved, ...renderableData]));
      setListRevision((revision) => revision + 1);
      return true;
    } catch (error) {
      if (abortRef.current?.signal.aborted) {
        return false;
      }
      if (isAuthError(error)) {
        setAuthError(AUTH_REQUIRED_MESSAGE);
        setLoadError(null);
        setListRevision((revision) => revision + 1);
        return false;
      }
      setLoadError(
        getErrorMessage(error, 'Failed to load threads. Please try again.'),
      );
      setListRevision((revision) => revision + 1);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [apiService, brandId, isActive, setThreads, viewStatus]);

  // Brand scope changes must clear the previous list, but this must happen in
  // an effect. Writing to the Zustand store during render causes React to
  // update the parent layout while AgentThreadList is still rendering.
  useEffect(() => {
    if (!isActive || previousBrandIdRef.current === brandId) {
      return;
    }

    previousBrandIdRef.current = brandId;
    setThreads([]);
    setIsLoading(true);
  }, [brandId, isActive, setThreads]);

  // Retry uses effect-scoped setTimeout; cleanup clears it + aborts in-flight fetch.
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    if (!isActive) {
      abortRef.current?.abort();
      setIsLoading(false);
      return;
    }

    let isDisposed = false;
    let retryTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let retryCount = 0;

    const clearRetryTimeout = (): void => {
      if (retryTimeoutId !== undefined) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = undefined;
      }
    };

    const scheduleRetry = (): void => {
      clearRetryTimeout();
      if (isDisposed || retryCount >= 3) {
        return;
      }
      retryCount += 1;
      const delayMs = retryCount * 1000;
      retryTimeoutId = setTimeout(() => {
        retryTimeoutId = undefined;
        void run();
      }, delayMs);
    };

    const run = async (): Promise<void> => {
      if (isDisposed) {
        return;
      }

      const loaded = await loadThreads();
      if (loaded || isDisposed) {
        return;
      }

      scheduleRetry();
    };

    void run();

    return () => {
      isDisposed = true;
      clearRetryTimeout();
      abortRef.current?.abort();
    };
  }, [isActive, loadThreads]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleFocus = () => {
      loadThreads().catch(() => undefined);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isActive, loadThreads]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleRefresh = () => {
      loadThreads().catch(() => undefined);
    };

    window.addEventListener(AGENT_REFRESH_CONVERSATIONS_EVENT, handleRefresh);
    return () =>
      window.removeEventListener(
        AGENT_REFRESH_CONVERSATIONS_EVENT,
        handleRefresh,
      );
  }, [isActive, loadThreads]);

  const prevActiveIdRef = useRef(activeThreadId);
  useEffect(() => {
    if (
      isActive &&
      viewStatus === AgentThreadStatus.ACTIVE &&
      activeThreadId &&
      activeThreadId !== prevActiveIdRef.current &&
      !threads.some((c) => c.id === activeThreadId)
    ) {
      loadThreads();
    }
    prevActiveIdRef.current = activeThreadId;
  }, [activeThreadId, isActive, threads, loadThreads, viewStatus]);

  const handleSelect = useCallback(
    async (thread: AgentThread) => {
      clearThreadAttention(thread.id);
      if (thread.id === activeThreadId) {
        return;
      }

      setActiveThread(thread.id);

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      if (onNavigate) {
        onNavigate(getThreadHref(thread.id));
        return;
      }

      setMessages([]);
      setWorkEvents([]);
      setActiveRun(null);
      resetStreamState();

      try {
        const messages = await runAgentApiEffect(
          apiService.getMessagesEffect(
            thread.id,
            { limit: 100 },
            abortRef.current.signal,
          ),
        );
        setAuthError(null);
        setLoadError(null);
        setMessages(messages);
        try {
          const convo = await runAgentApiEffect(
            apiService.getThreadEffect(thread.id, abortRef.current.signal),
          );
          setThreadPrompt(thread.id, convo.systemPrompt ?? undefined);
        } catch {
          // ignore metadata load failure
        }
      } catch (error) {
        if (abortRef.current?.signal.aborted) {
          return;
        }
        if (isAuthError(error)) {
          setAuthError(AUTH_REQUIRED_MESSAGE);
          setError(AUTH_REQUIRED_MESSAGE);
          return;
        }
        setLoadError(
          getErrorMessage(error, 'Failed to open thread. Please try again.'),
        );
      }
    },
    [
      activeThreadId,
      apiService,
      clearThreadAttention,
      getThreadHref,
      onNavigate,
      setError,
      setActiveRun,
      setActiveThread,
      setThreadPrompt,
      setMessages,
      setWorkEvents,
      resetStreamState,
    ],
  );

  const handleArchiveFromMenu = useCallback(
    async (thread: AgentThread) => {
      try {
        await runAgentApiEffect(apiService.archiveThreadEffect(thread.id));
        const currentThreads = useAgentChatStore.getState().threads;
        setThreads(currentThreads.filter((item) => item.id !== thread.id));

        if (thread.id === activeThreadId) {
          clearMessages();
          if (onNavigate) {
            onNavigate(getNewThreadHref());
          }
        }
      } catch {
        // Silently ignore failed archive
      } finally {
        setOpenMenuThreadId(null);
      }
    },
    [
      apiService,
      activeThreadId,
      clearMessages,
      getNewThreadHref,
      onNavigate,
      setThreads,
    ],
  );

  const handleUnarchiveFromMenu = useCallback(
    async (thread: AgentThread) => {
      try {
        await runAgentApiEffect(apiService.unarchiveThreadEffect(thread.id));
        const currentThreads = useAgentChatStore.getState().threads;
        setThreads(currentThreads.filter((item) => item.id !== thread.id));
      } catch {
        // Silently ignore failed unarchive
      } finally {
        setOpenMenuThreadId(null);
      }
    },
    [apiService, setThreads],
  );

  const handleForkThread = useCallback(
    async (thread: AgentThread) => {
      try {
        const branchedThread = await runAgentApiEffect(
          apiService.branchThreadEffect(thread.id),
        );
        const currentThreads = useAgentChatStore.getState().threads;
        setThreads(
          sortThreads([
            branchedThread,
            ...currentThreads.filter((item) => item.id !== branchedThread.id),
          ]),
        );

        if (onNavigate) {
          onNavigate(getThreadHref(branchedThread.id));
          return;
        }

        clearMessages();
        setMessages([]);
        setWorkEvents([]);
        setActiveRun(null);
        resetStreamState();
        setActiveThread(branchedThread.id);
      } catch {
        // Silently ignore failed branch
      } finally {
        setOpenMenuThreadId(null);
      }
    },
    [
      apiService,
      clearMessages,
      getThreadHref,
      onNavigate,
      resetStreamState,
      setActiveRun,
      setActiveThread,
      setMessages,
      setThreads,
      setWorkEvents,
    ],
  );

  const handleTogglePinned = useCallback(
    async (thread: AgentThread) => {
      try {
        const updatedThread = thread.isPinned
          ? await runAgentApiEffect(apiService.unpinThreadEffect(thread.id))
          : await runAgentApiEffect(apiService.pinThreadEffect(thread.id));
        const currentThreads = useAgentChatStore.getState().threads;
        setThreads(
          sortThreads(
            currentThreads.map((item) =>
              item.id === thread.id ? { ...item, ...updatedThread } : item,
            ),
          ),
        );
      } catch {
        // Silently ignore failed pin toggle
      } finally {
        setOpenMenuThreadId(null);
      }
    },
    [apiService, setThreads],
  );

  const handleArchiveAllThreads = useCallback(async () => {
    try {
      await runAgentApiEffect(
        apiService.archiveAllThreadsEffect(brandId || undefined),
      );
      const currentThreads = useAgentChatStore.getState().threads;
      const archivedActiveThread = currentThreads.some(
        (thread) => thread.id === activeThreadId,
      );

      setThreads([]);

      if (archivedActiveThread) {
        clearMessages();
        if (onNavigate) {
          onNavigate(getNewThreadHref());
        }
      }
    } catch {
      // Silently ignore failed bulk archive
    }
  }, [
    activeThreadId,
    apiService,
    brandId,
    clearMessages,
    getNewThreadHref,
    onNavigate,
    setThreads,
  ]);

  const handleStartRename = useCallback((thread: AgentThread) => {
    setOpenMenuThreadId(null);
    setRenamingThreadId(thread.id);
    setRenameDraft(thread.title || 'Untitled');
  }, []);

  const handleCancelRename = useCallback(() => {
    setRenamingThreadId(null);
    setRenameDraft('');
  }, []);

  const handleSubmitRename = useCallback(
    async (thread: AgentThread) => {
      const trimmedTitle = renameDraft.trim();

      if (!trimmedTitle || trimmedTitle === (thread.title || 'Untitled')) {
        handleCancelRename();
        return;
      }

      try {
        const updatedThread = await runAgentApiEffect(
          apiService.updateThreadEffect(thread.id, {
            title: trimmedTitle,
          }),
        );
        const currentThreads = useAgentChatStore.getState().threads;
        setThreads(
          sortThreads(
            currentThreads.map((item) =>
              item.id === thread.id ? { ...item, ...updatedThread } : item,
            ),
          ),
        );
      } catch {
        // Silently ignore failed rename
      } finally {
        handleCancelRename();
      }
    },
    [apiService, handleCancelRename, renameDraft, setThreads],
  );

  const handleThreadContextMenu = useCallback(
    (event: React.MouseEvent, threadId: string) => {
      event.preventDefault();
      event.stopPropagation();
      setOpenMenuThreadId(threadId);
      menuButtonRefs.current[threadId]?.focus();
    },
    [],
  );

  const isArchivedView = viewStatus === AgentThreadStatus.ARCHIVED;

  const renderableThreads = useMemo(() => {
    const scopedThreads = brandId
      ? threads.filter((thread) => thread.brandId === brandId)
      : threads;
    return scopedThreads.filter(hasRenderableThreadId);
  }, [brandId, threads]);
  const pinnedThreads = useMemo(
    () => renderableThreads.filter((thread) => thread.isPinned),
    [renderableThreads],
  );
  const regularThreads = useMemo(
    () => renderableThreads.filter((thread) => !thread.isPinned),
    [renderableThreads],
  );

  const shouldShowEmptyState =
    !isLoading && !authError && !loadError && renderableThreads.length === 0;

  const shouldShowLoadFailureState =
    !isLoading &&
    !authError &&
    Boolean(loadError) &&
    renderableThreads.length === 0;

  const shouldShowHeader =
    !authError && !shouldShowLoadFailureState && !isLoading;

  const handleToggleView = useCallback(() => {
    setViewStatus((current) =>
      current === AgentThreadStatus.ACTIVE
        ? AgentThreadStatus.ARCHIVED
        : AgentThreadStatus.ACTIVE,
    );
  }, []);

  const handleRetryLoad = useCallback(() => {
    loadThreads().catch(() => undefined);
  }, [loadThreads]);

  return {
    threads: renderableThreads,
    activeThreadId,
    activeRunStatus,
    isStreaming,
    threadUiBusyById,
    isLoading,
    authError,
    loadError,
    viewStatus,
    openMenuThreadId,
    renamingThreadId,
    renameDraft,
    renameInputRef,
    menuButtonRefs,
    isArchivedView,
    pinnedThreads,
    regularThreads,
    shouldShowEmptyState,
    shouldShowLoadFailureState,
    shouldShowHeader,
    getThreadHref,
    setRenameDraft,
    setOpenMenuThreadId,
    handleSelect,
    handleArchiveFromMenu,
    handleUnarchiveFromMenu,
    handleForkThread,
    handleTogglePinned,
    handleArchiveAllThreads,
    handleStartRename,
    handleCancelRename,
    handleSubmitRename,
    handleThreadContextMenu,
    handleToggleView,
    handleRetryLoad,
  };
}
