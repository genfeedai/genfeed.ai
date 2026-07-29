import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  ConversationSidebarSearch,
  ConversationSidebarSection,
} from '@genfeedai/ui';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
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
  searchAction?: ReactNode;
  /**
   * @deprecated No longer lifts actions into a parent slot. Header chrome is
   * owned here so parent nav-panel identity stays stable (no remount loops).
   */
  onActionsChange?: (actions: ReactNode) => void;
  /** When true, render the Conversations label above search. */
  showTitle?: boolean;
}

export { AGENT_REFRESH_CONVERSATIONS_EVENT };

export function AgentThreadList({
  apiService,
  isActive = true,
  onNavigate,
  searchAction,
  showTitle = true,
}: AgentThreadListProps): ReactElement {
  // Filter chips removed — grouping sections are the filter surface.
  const filter: AgentThreadListFilter = 'all';
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

  const groups = useMemo(
    () =>
      groupAgentThreads(threads, {
        activeRunStatus,
        activeThreadId,
        filter,
        isStreaming,
        searchQuery,
      }),
    [activeRunStatus, activeThreadId, isStreaming, searchQuery, threads],
  );
  const visibleThreadCount =
    groups.needsYou.length +
    groups.working.length +
    groups.pinned.length +
    groups.recent.length;

  // Only replace the list with a spinner on the first load. Background
  // refreshes keep the existing rows so switching threads does not flash.
  const showEmptyOrLoadStates =
    (isLoading && threads.length === 0) ||
    shouldShowLoadFailureState ||
    shouldShowEmptyState;

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
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="agent-thread-list"
    >
      <AgentThreadListErrorBanner
        authError={authError}
        loadError={loadError}
        hasThreads={threads.length > 0}
        onRetry={handleRetryLoad}
      />

      {showTitle || shouldShowHeader ? (
        <div className="flex w-full items-center gap-2 px-3 py-1.5">
          {showTitle ? (
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/40">
              Conversations
            </span>
          ) : null}
          {shouldShowHeader ? (
            <div className="ml-auto flex items-center gap-0.5">
              <AgentThreadListHeaderActions
                viewStatus={viewStatus}
                threadCount={threads.length}
                onArchiveAll={() => {
                  handleArchiveAllThreads().catch(() => undefined);
                }}
                onToggleView={handleToggleView}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <ConversationSidebarSearch
        action={searchAction}
        ariaLabel="Search agent conversations"
        placeholder="Search conversations"
        value={searchQuery}
        onChange={setSearchQuery}
      />

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
              Try another search.
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
