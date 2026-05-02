import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  AgentThreadStatus,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Input } from '@ui/primitives/input';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import Link from 'next/link';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  HiArchiveBox,
  HiArrowPath,
  HiArrowUturnLeft,
  HiEllipsisHorizontal,
  HiOutlineArchiveBoxXMark,
  HiOutlineArrowTurnDownRight,
  HiOutlineChatBubbleLeftRight,
  HiOutlineExclamationTriangle,
  HiOutlinePencilSquare,
} from 'react-icons/hi2';
import { PiPushPinSimple } from 'react-icons/pi';

interface AgentThreadListProps {
  apiService: AgentApiService;
  isActive?: boolean;
  onNavigate?: (path: string) => void;
  onActionsChange?: (actions: ReactNode) => void;
}

export const AGENT_REFRESH_CONVERSATIONS_EVENT = 'agent:threads:refresh';
const AUTH_REQUIRED_MESSAGE =
  'Authentication required. Refresh the page or sign in again.';
const CONVERSATION_LIMIT = 50;

function formatRelativeTime(timestamp?: string): string | null {
  if (!timestamp) {
    return null;
  }

  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) {
    return null;
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));

  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  return `${Math.floor(diffHours / 24)}d`;
}

function getThreadStatusMeta(
  thread: AgentThread,
  options?: {
    activeRunStatus?:
      | 'idle'
      | 'running'
      | 'cancelling'
      | 'completed'
      | 'failed'
      | 'cancelled';
    activeThreadId?: string | null;
  },
): {
  label: string;
  tone: 'neutral' | 'running' | 'warning';
} | null {
  if (thread.pendingInputCount && thread.pendingInputCount > 0) {
    return {
      label: 'Needs input',
      tone: 'warning',
    };
  }

  if (
    options?.activeThreadId === thread.id &&
    (thread.runStatus === 'queued' ||
      thread.runStatus === 'running' ||
      options.activeRunStatus === 'running' ||
      options.activeRunStatus === 'cancelling')
  ) {
    return {
      label: 'Awaiting response',
      tone: 'running',
    };
  }

  if (thread.attentionState === 'updated') {
    return {
      label: 'Updated',
      tone: 'neutral',
    };
  }

  return null;
}

function getThreadStatusDotClass(options: {
  attentionState?: AgentThread['attentionState'];
  pendingInputCount?: AgentThread['pendingInputCount'];
}): string {
  if (
    options.attentionState === 'needs-input' ||
    (options.pendingInputCount ?? 0) > 0
  ) {
    return 'bg-amber-300';
  }

  if (options.attentionState === 'updated') {
    return 'bg-sky-300';
  }

  return 'bg-white/10';
}

function getThreadStatusA11yLabel(
  thread: AgentThread,
  statusMeta: ReturnType<typeof getThreadStatusMeta>,
): string {
  if (statusMeta) {
    return `${statusMeta.label} status for ${thread.title || 'Untitled'}`;
  }

  return `Conversation status for ${thread.title || 'Untitled'}`;
}

function sortThreads(threads: AgentThread[]): AgentThread[] {
  return [...threads].sort((left, right) => {
    const pinnedDelta =
      Number(right.isPinned ?? false) - Number(left.isPinned ?? false);
    if (pinnedDelta !== 0) {
      return pinnedDelta;
    }

    return (
      new Date(right.updatedAt ?? right.createdAt).getTime() -
      new Date(left.updatedAt ?? left.createdAt).getTime()
    );
  });
}

function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes('401') || error.message.includes('Unauthorized')
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  const trimmed = error.message.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function AgentThreadList({
  apiService,
  isActive = true,
  onNavigate,
  onActionsChange,
}: AgentThreadListProps): ReactElement {
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
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewStatus, setViewStatus] = useState<AgentThreadStatus>(
    AgentThreadStatus.ACTIVE,
  );
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const getThreadHref = useCallback(
    (threadId: string) => `/chat/${threadId}`,
    [],
  );
  const getNewThreadHref = useCallback(() => '/chat/new', []);

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

    setIsLoading(true);
    try {
      const data = await runAgentApiEffect(
        apiService.getThreadsEffect(
          { limit: CONVERSATION_LIMIT, status: viewStatus },
          abortRef.current.signal,
        ),
      );
      setAuthError(null);
      setLoadError(null);
      const { threads: current, activeThreadId: currentActiveId } =
        useAgentChatStore.getState();
      const apiIds = new Set(data.map((item) => item.id));

      // Always preserve the active thread — never drop it from the list
      const activeThread =
        currentActiveId && !apiIds.has(currentActiveId)
          ? current.find((t) => t.id === currentActiveId)
          : null;

      // Also preserve other recently-created local threads (optimistic UI)
      const RECENT_THRESHOLD_MS = 15_000;
      const now = Date.now();
      const recentLocalThreads =
        viewStatus === AgentThreadStatus.ACTIVE
          ? current.filter(
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
      setThreads(sortThreads([...preserved, ...data]));
      return true;
    } catch (error) {
      if (abortRef.current?.signal.aborted) {
        return false;
      }
      if (isAuthError(error)) {
        setAuthError(AUTH_REQUIRED_MESSAGE);
        setLoadError(null);
        return false;
      }
      setLoadError(
        getErrorMessage(error, 'Failed to load threads. Please try again.'),
      );
      // Silently ignore aborted/failed fetches.
      // Callers can use the return value to decide on retries.
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [apiService, isActive, setThreads, viewStatus]);

  useEffect(() => {
    if (!isActive) {
      abortRef.current?.abort();
      setIsLoading(false);
      return;
    }

    let isDisposed = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;

    const run = async () => {
      if (isDisposed) {
        return;
      }

      const loaded = await loadThreads();
      if (loaded || isDisposed) {
        return;
      }

      if (retryCount >= 3) {
        return;
      }

      retryCount += 1;
      retryTimeout = setTimeout(() => {
        run().catch(() => undefined);
      }, retryCount * 1000);
    };

    run().catch(() => undefined);

    return () => {
      isDisposed = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
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
      await runAgentApiEffect(apiService.archiveAllThreadsEffect());
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
  const toggleButtonLabel = isArchivedView
    ? 'Show recent threads'
    : 'Show archived threads';
  const pinnedThreads = useMemo(
    () => threads.filter((thread) => thread.isPinned),
    [threads],
  );
  const regularThreads = useMemo(
    () => threads.filter((thread) => !thread.isPinned),
    [threads],
  );

  const shouldShowEmptyState =
    !isLoading && !authError && !loadError && threads.length === 0;

  const shouldShowLoadFailureState =
    !isLoading && !authError && Boolean(loadError) && threads.length === 0;

  const shouldShowHeader =
    !authError && !shouldShowLoadFailureState && !isLoading;

  const headerActions = useMemo(() => {
    if (!shouldShowHeader) {
      return null;
    }
    return (
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/collapsible:opacity-100 focus-within:opacity-100">
        {!isArchivedView && (
          <SimpleTooltip label="Refresh conversations" position="bottom">
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              withWrapper={false}
              ariaLabel="Refresh conversations"
              className="rounded p-1 text-white/35 hover:bg-white/[0.08] hover:text-white/75"
              onClick={() => {
                window.dispatchEvent(
                  new Event(AGENT_REFRESH_CONVERSATIONS_EVENT),
                );
              }}
            >
              <HiArrowPath className="h-3.5 w-3.5" />
            </Button>
          </SimpleTooltip>
        )}
        {!isArchivedView && threads.length > 0 && (
          <SimpleTooltip label="Archive all threads" position="bottom">
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              withWrapper={false}
              ariaLabel="Archive all threads"
              className="rounded p-1 text-white/35 hover:bg-white/[0.08] hover:text-white/75"
              onClick={() => {
                handleArchiveAllThreads().catch(() => undefined);
              }}
            >
              <HiOutlineArchiveBoxXMark className="h-3.5 w-3.5" />
            </Button>
          </SimpleTooltip>
        )}
        <SimpleTooltip label={toggleButtonLabel} position="bottom">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            withWrapper={false}
            ariaLabel={toggleButtonLabel}
            className="rounded p-1 text-white/35 hover:bg-white/[0.08] hover:text-white/75"
            onClick={() => {
              setViewStatus((current) =>
                current === AgentThreadStatus.ACTIVE
                  ? AgentThreadStatus.ARCHIVED
                  : AgentThreadStatus.ACTIVE,
              );
            }}
          >
            <HiArchiveBox className="h-3.5 w-3.5" />
          </Button>
        </SimpleTooltip>
      </div>
    );
  }, [
    shouldShowHeader,
    isArchivedView,
    threads.length,
    toggleButtonLabel,
    handleArchiveAllThreads,
  ]);

  useEffect(() => {
    onActionsChange?.(headerActions);
    return () => onActionsChange?.(null);
  }, [headerActions, onActionsChange]);

  const renderThreadRow = useCallback(
    (conv: AgentThread) => {
      const isActiveConversation = conv.id === activeThreadId;
      const isConversationWorking =
        conv.id === activeThreadId &&
        (isStreaming ||
          activeRunStatus === 'running' ||
          activeRunStatus === 'cancelling');
      const isThreadMarkedRunning =
        isActiveConversation &&
        (conv.runStatus === 'queued' || conv.runStatus === 'running');
      const isThreadUiBusy =
        isActiveConversation && threadUiBusyById[conv.id] === true;
      const statusMeta = getThreadStatusMeta(conv, {
        activeRunStatus,
        activeThreadId,
      });
      const relativeTime = formatRelativeTime(
        conv.lastActivityAt ?? conv.updatedAt ?? conv.createdAt,
      );
      const isLoadingStatus =
        isConversationWorking || isThreadMarkedRunning || isThreadUiBusy;
      const statusDotClass = getThreadStatusDotClass({
        attentionState: conv.attentionState,
        pendingInputCount: conv.pendingInputCount,
      });
      const statusA11yLabel = getThreadStatusA11yLabel(conv, statusMeta);
      const statusIndicator = isLoadingStatus ? (
        <Spinner
          size={ComponentSize.XS}
          className="shrink-0 text-white/45"
          ariaLabel={statusA11yLabel}
          title={statusMeta?.label ?? `${conv.title || 'Conversation'} status`}
        />
      ) : (
        <span
          className={cn(
            'h-2.5 w-2.5 shrink-0 rounded-full border border-white/15',
            statusDotClass,
          )}
          role="img"
          aria-label={statusA11yLabel}
          title={statusMeta?.label ?? `${conv.title || 'Conversation'} status`}
          tabIndex={statusMeta ? 0 : -1}
        />
      );

      return (
        <div
          key={conv.id}
          className={cn(
            'group relative flex h-9 w-full items-center rounded-md transition-colors',
            conv.status === AgentThreadStatus.ARCHIVED && 'opacity-55',
            conv.id === activeThreadId
              ? 'bg-white/[0.08]'
              : 'hover:bg-white/[0.04]',
          )}
          onContextMenu={(event) => handleThreadContextMenu(event, conv.id)}
        >
          {renamingThreadId === conv.id ? (
            <div className="flex h-full flex-1 items-center gap-2 px-3">
              {statusIndicator}
              <Input
                ref={renameInputRef}
                aria-label={`Rename ${conv.title || 'thread'}`}
                className="min-w-0 flex-1"
                value={renameDraft}
                onBlur={() => {
                  handleSubmitRename(conv).catch(() => undefined);
                }}
                onChange={(event) => {
                  setRenameDraft(event.target.value);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSubmitRename(conv).catch(() => undefined);
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    handleCancelRename();
                  }
                }}
              />
            </div>
          ) : (
            <Link
              href={getThreadHref(conv.id)}
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              onClick={() => {
                handleSelect(conv).catch(() => undefined);
              }}
            >
              {statusMeta ? (
                <SimpleTooltip label={statusMeta.label} position="top">
                  {statusIndicator}
                </SimpleTooltip>
              ) : (
                statusIndicator
              )}
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  {conv.isPinned ? (
                    <PiPushPinSimple
                      className="h-3 w-3 shrink-0 -rotate-45 text-white/40"
                      title="Pinned conversation"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">
                    {conv.title || 'Untitled'}
                  </span>
                </div>
                {relativeTime ? (
                  <span className="shrink-0 text-[11px] text-white/40">
                    {relativeTime}
                  </span>
                ) : null}
              </div>
            </Link>
          )}

          <div className="ml-1 shrink-0 self-center">
            <DropdownMenu
              open={openMenuThreadId === conv.id}
              onOpenChange={(open) => {
                setOpenMenuThreadId(open ? conv.id : null);
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  ref={(element) => {
                    menuButtonRefs.current[conv.id] = element;
                  }}
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.ICON}
                  withWrapper={false}
                  ariaLabel={`Thread actions for ${conv.title || 'thread'}`}
                  className={cn(
                    'rounded p-1 text-foreground/30 hover:bg-white/[0.08] hover:text-foreground/70',
                    renamingThreadId === conv.id
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <HiEllipsisHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onSelect={() => {
                    handleTogglePinned(conv).catch(() => undefined);
                  }}
                >
                  <PiPushPinSimple className="h-4 w-4 -rotate-45" />
                  {conv.isPinned ? 'Unpin conversation' : 'Pin conversation'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    handleForkThread(conv).catch(() => undefined);
                  }}
                >
                  <HiOutlineArrowTurnDownRight className="h-4 w-4" />
                  Fork thread
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    handleStartRename(conv);
                  }}
                >
                  <HiOutlinePencilSquare className="h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    if (isArchivedView) {
                      handleUnarchiveFromMenu(conv).catch(() => undefined);
                      return;
                    }

                    handleArchiveFromMenu(conv).catch(() => undefined);
                  }}
                >
                  {isArchivedView ? (
                    <HiArrowUturnLeft className="h-4 w-4" />
                  ) : (
                    <HiOutlineArchiveBoxXMark className="h-4 w-4" />
                  )}
                  {isArchivedView ? 'Restore' : 'Archive'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      );
    },
    [
      activeRunStatus,
      activeThreadId,
      handleArchiveFromMenu,
      handleCancelRename,
      handleForkThread,
      handleSelect,
      handleStartRename,
      handleSubmitRename,
      handleThreadContextMenu,
      handleTogglePinned,
      handleUnarchiveFromMenu,
      getThreadHref,
      isArchivedView,
      isStreaming,
      openMenuThreadId,
      renameDraft,
      renamingThreadId,
      threadUiBusyById,
    ],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {authError && (
        <div className="mx-3 mt-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {authError}
        </div>
      )}
      {loadError && !authError && threads.length > 0 && (
        <div className="mx-3 mt-2 rounded-md border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
          <div className="flex items-center justify-between gap-2">
            <span>{loadError}</span>
            <Button
              withWrapper={false}
              variant={ButtonVariant.OUTLINE}
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                loadThreads().catch(() => undefined);
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {headerActions && !onActionsChange ? (
        <div className="group/collapsible flex items-center justify-end px-3 pb-1 pt-2">
          {headerActions}
        </div>
      ) : null}

      {/* Scrollable thread list */}
      <div
        data-testid="agent-thread-list-scroll"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin"
      >
        {isLoading && threads.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : shouldShowLoadFailureState ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 ring-1 ring-inset ring-orange-500/20">
              <HiOutlineExclamationTriangle className="h-5 w-5 text-orange-200/80" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground/70">
                Failed to load threads
              </p>
              <p className="text-xs text-foreground/40">
                Check your connection and try again.
              </p>
            </div>
            <Button
              withWrapper={false}
              variant={ButtonVariant.OUTLINE}
              className="h-8 px-3 text-xs"
              onClick={() => {
                loadThreads().catch(() => undefined);
              }}
            >
              Retry
            </Button>
          </div>
        ) : shouldShowEmptyState ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/10">
              <HiOutlineChatBubbleLeftRight className="h-5 w-5 text-foreground/30" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground/50">
                No threads
              </p>
              <p className="mt-0.5 text-xs text-foreground/30">
                Start one to get going
              </p>
            </div>
          </div>
        ) : (
          <div
            data-testid="agent-thread-list-content"
            className="flex flex-col gap-2 pb-2"
          >
            {pinnedThreads.length > 0 ? (
              <div
                data-testid="pinned-thread-section"
                className="flex flex-col gap-0.5"
              >
                {pinnedThreads.map(renderThreadRow)}
              </div>
            ) : null}
            {pinnedThreads.length > 0 && regularThreads.length > 0 ? (
              <div
                aria-hidden="true"
                className="mx-1 border-t border-white/[0.08]"
              />
            ) : null}
            <div className="flex flex-col gap-0.5">
              {regularThreads.map(renderThreadRow)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
