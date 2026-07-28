import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  type ConversationSidebarFilter,
  ConversationSidebarFilters,
  ConversationSidebarSearch,
  ConversationSidebarSection,
} from '@genfeedai/ui';
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AgentThreadListEmptyState } from './AgentThreadListEmptyState';
import { AgentThreadListErrorBanner } from './AgentThreadListErrorBanner';
import { AgentThreadListHeaderActions } from './AgentThreadListHeaderActions';
import { AgentThreadListRow } from './AgentThreadListRow';
import {
  AGENT_REFRESH_CONVERSATIONS_EVENT,
  type AgentThreadListFilter,
  groupAgentThreads,
} from './agent-thread-list.helpers';
import { useAgentThreadList } from './useAgentThreadList';

interface AgentThreadListProps {
  apiService: AgentApiService;
  isActive?: boolean;
  onNavigate?: (path: string) => void;
  onActionsChange?: (actions: ReactNode) => void;
  searchAction?: ReactNode;
}

export { AGENT_REFRESH_CONVERSATIONS_EVENT };

export function AgentThreadList({
  apiService,
  isActive = true,
  onNavigate,
  onActionsChange,
  searchAction,
}: AgentThreadListProps): ReactElement {
  const [filter, setFilter] = useState<AgentThreadListFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const {
    threads,
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
  } = useAgentThreadList({ apiService, isActive, onNavigate });

  const unfilteredGroups = useMemo(
    () =>
      groupAgentThreads(threads, {
        activeRunStatus,
        activeThreadId,
        filter: 'all',
        isStreaming,
        searchQuery: '',
      }),
    [activeRunStatus, activeThreadId, isStreaming, threads],
  );
  const activeFilter = isArchivedView ? 'all' : filter;
  const groups = useMemo(
    () =>
      groupAgentThreads(threads, {
        activeRunStatus,
        activeThreadId,
        filter: activeFilter,
        isStreaming,
        searchQuery,
      }),
    [
      activeRunStatus,
      activeThreadId,
      activeFilter,
      isStreaming,
      searchQuery,
      threads,
    ],
  );
  const visibleThreadCount =
    groups.needsYou.length +
    groups.working.length +
    groups.pinned.length +
    groups.recent.length;
  const filters = useMemo<
    readonly ConversationSidebarFilter<AgentThreadListFilter>[]
  >(
    () => [
      { label: 'All', value: 'all' },
      {
        count: unfilteredGroups.needsYou.length,
        label: 'Needs you',
        value: 'needs-you',
      },
      {
        count: unfilteredGroups.working.length,
        label: 'Working',
        value: 'working',
      },
      {
        count: threads.filter((thread) => thread.isPinned).length,
        label: 'Pinned',
        value: 'pinned',
      },
    ],
    [
      threads,
      unfilteredGroups.needsYou.length,
      unfilteredGroups.working.length,
    ],
  );

  const headerActions = useMemo(() => {
    if (!shouldShowHeader) {
      return null;
    }
    return (
      <AgentThreadListHeaderActions
        viewStatus={viewStatus}
        threadCount={threads.length}
        onArchiveAll={() => {
          handleArchiveAllThreads().catch(() => undefined);
        }}
        onToggleView={handleToggleView}
      />
    );
  }, [
    shouldShowHeader,
    viewStatus,
    threads.length,
    handleArchiveAllThreads,
    handleToggleView,
  ]);

  useEffect(() => {
    onActionsChange?.(headerActions);
    return () => onActionsChange?.(null);
  }, [headerActions, onActionsChange]);

  const showEmptyOrLoadStates =
    isLoading || shouldShowLoadFailureState || shouldShowEmptyState;

  const renderThreadRow = (conv: (typeof threads)[number]) => (
    <AgentThreadListRow
      key={conv.id}
      conv={conv}
      activeThreadId={activeThreadId}
      activeRunStatus={activeRunStatus}
      isStreaming={isStreaming}
      threadUiBusyById={threadUiBusyById}
      openMenuThreadId={openMenuThreadId}
      renamingThreadId={renamingThreadId}
      renameDraft={renameDraft}
      renameInputRef={renameInputRef}
      isArchivedView={isArchivedView}
      getThreadHref={getThreadHref}
      onContextMenu={handleThreadContextMenu}
      onSelect={(thread) => {
        handleSelect(thread).catch(() => undefined);
      }}
      onMenuOpenChange={(threadId, open) => {
        setOpenMenuThreadId(open ? threadId : null);
      }}
      onMenuButtonRef={(threadId, element) => {
        menuButtonRefs.current[threadId] = element;
      }}
      onRenameDraftChange={setRenameDraft}
      onSubmitRename={(thread) => {
        handleSubmitRename(thread).catch(() => undefined);
      }}
      onCancelRename={handleCancelRename}
      onTogglePinned={(thread) => {
        handleTogglePinned(thread).catch(() => undefined);
      }}
      onForkThread={(thread) => {
        handleForkThread(thread).catch(() => undefined);
      }}
      onStartRename={handleStartRename}
      onArchive={(thread) => {
        handleArchiveFromMenu(thread).catch(() => undefined);
      }}
      onUnarchive={(thread) => {
        handleUnarchiveFromMenu(thread).catch(() => undefined);
      }}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AgentThreadListErrorBanner
        authError={authError}
        loadError={loadError}
        hasThreads={threads.length > 0}
        onRetry={handleRetryLoad}
      />

      {headerActions && !onActionsChange ? (
        <div className="group/collapsible flex items-center justify-end px-3 pb-1 pt-2">
          {headerActions}
        </div>
      ) : null}

      <ConversationSidebarSearch
        action={searchAction}
        ariaLabel="Search agent conversations"
        placeholder="Search conversations"
        value={searchQuery}
        onChange={setSearchQuery}
      />
      {!isArchivedView ? (
        <ConversationSidebarFilters
          ariaLabel="Filter agent conversations"
          filters={filters}
          value={filter}
          onChange={setFilter}
        />
      ) : null}

      <div
        data-testid="agent-thread-list-scroll"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin"
      >
        {showEmptyOrLoadStates ? (
          <AgentThreadListEmptyState
            isLoading={isLoading && threads.length === 0}
            shouldShowLoadFailureState={shouldShowLoadFailureState}
            shouldShowEmptyState={shouldShowEmptyState}
            onRetry={handleRetryLoad}
          />
        ) : visibleThreadCount === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center px-6 text-center">
            <p className="text-sm text-foreground/50">
              No matching conversations
            </p>
            <p className="mt-1 text-xs text-foreground/30">
              Try another search or filter.
            </p>
          </div>
        ) : (
          <div
            data-testid="agent-thread-list-content"
            className="flex flex-col gap-2 pb-3"
          >
            {isArchivedView ? (
              <ConversationSidebarSection
                count={visibleThreadCount}
                label="Archived"
              >
                {[
                  ...groups.needsYou,
                  ...groups.working,
                  ...groups.pinned,
                  ...groups.recent,
                ].map(renderThreadRow)}
              </ConversationSidebarSection>
            ) : null}
            {!isArchivedView && groups.needsYou.length > 0 ? (
              <ConversationSidebarSection
                count={groups.needsYou.length}
                label="Needs you"
              >
                {groups.needsYou.map(renderThreadRow)}
              </ConversationSidebarSection>
            ) : null}
            {!isArchivedView && groups.working.length > 0 ? (
              <ConversationSidebarSection
                count={groups.working.length}
                label="Working"
              >
                {groups.working.map(renderThreadRow)}
              </ConversationSidebarSection>
            ) : null}
            {!isArchivedView && groups.pinned.length > 0 ? (
              <ConversationSidebarSection
                count={groups.pinned.length}
                label="Pinned"
              >
                {groups.pinned.map(renderThreadRow)}
              </ConversationSidebarSection>
            ) : null}
            {!isArchivedView && groups.recent.length > 0 ? (
              <ConversationSidebarSection
                count={groups.recent.length}
                label="Recent"
              >
                {groups.recent.map(renderThreadRow)}
              </ConversationSidebarSection>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
