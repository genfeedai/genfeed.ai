import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { ConversationSidebarSection } from '@genfeedai/ui';
import { type ReactElement, useMemo } from 'react';
import { AgentThreadListEmptyState } from './AgentThreadListEmptyState';
import { AgentThreadListErrorBanner } from './AgentThreadListErrorBanner';
import { AgentThreadListHeaderActions } from './AgentThreadListHeaderActions';
import { AgentThreadListRow } from './AgentThreadListRow';
import {
  type AgentThreadListFilter,
  groupAgentThreads,
  groupAgentThreadsByBrand,
} from './agent-thread-list.helpers';
import { useAgentThreadList } from './useAgentThreadList';
import { useAgentThreadPrefetch } from './useAgentThreadPrefetch';

export type AgentThreadListProps = {
  apiService: AgentApiService;
  isActive?: boolean;
  /**
   * When set, list is hard-filtered to this brand. When null/omitted, full org
   * conversations (brand dropdown cleared).
   */
  brandId?: string | null;
  onNavigate?: (path: string) => void;
  /** Resolve the final app-scoped route without a proxy redirect. */
  resolveThreadHref?: (thread: AgentThread) => string;
  /** When true, render the Conversations label above search. */
  showTitle?: boolean;
};

export function AgentThreadList({
  apiService,
  isActive = true,
  brandId = null,
  onNavigate,
  resolveThreadHref,
  showTitle = false,
}: AgentThreadListProps): ReactElement {
  // Filter chips removed — grouping sections are the filter surface.
  const filter: AgentThreadListFilter = 'all';
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
    handleRefresh,
  } = useAgentThreadList({
    apiService,
    isActive,
    brandId,
    onNavigate,
    resolveThreadHref,
  });
  const { prefetchThread, cancelPrefetch } = useAgentThreadPrefetch({
    apiService,
  });

  const groups = useMemo(
    () =>
      groupAgentThreads(threads, {
        activeRunStatus,
        activeThreadId,
        filter,
        isStreaming,
        // Filtering moved to the command palette; the grouping helpers still
        // take a query, so pass an explicit empty one rather than undefined.
        searchQuery: '',
      }),
    [activeRunStatus, activeThreadId, isStreaming, threads],
  );
  const brandGroups = useMemo(
    () => groupAgentThreadsByBrand(threads, { searchQuery: '' }),
    [threads],
  );
  const isBrandScoped = Boolean(brandId);
  const shouldGroupByBrand = !isArchivedView && !isBrandScoped;
  const visibleThreadCount = shouldGroupByBrand
    ? brandGroups.reduce((count, group) => count + group.threads.length, 0)
    : groups.needsYou.length +
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
      usesProgrammaticNavigation={Boolean(onNavigate)}
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
      onPrefetch={prefetchThread}
      onCancelPrefetch={cancelPrefetch}
    />
  );

  // New Conversation and Search are sidebar rows on every surface now, so the
  // panel carries no field or "+" of its own — the list actions hang off the
  // section header they act on.
  const listActions = shouldShowHeader ? (
    <AgentThreadListHeaderActions
      viewStatus={viewStatus}
      threadCount={threads.length}
      onArchiveAll={() => {
        handleArchiveAllThreads().catch(() => undefined);
      }}
      onRefresh={() => {
        handleRefresh().catch(() => undefined);
      }}
      onToggleView={handleToggleView}
    />
  ) : null;

  // The actions hang off a section header rather than a bar of their own, so
  // they ride the first section that actually renders. Pinning them to Recent
  // alone would strand archive-all and the archived toggle in the archived and
  // brand-grouped views, which have no Recent section.
  const actionsSectionId = isArchivedView
    ? 'archived'
    : shouldGroupByBrand
      ? (brandGroups[0]?.brandId ?? 'organization')
      : groups.needsYou.length > 0
        ? 'needsYou'
        : groups.working.length > 0
          ? 'working'
          : groups.pinned.length > 0
            ? 'pinned'
            : 'recent';

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

      {showTitle ? (
        <div className="flex w-full items-center gap-2 px-3 py-1.5">
          <span className="text-2xs font-bold uppercase tracking-[0.15em] text-foreground/40">
            Conversations
          </span>
        </div>
      ) : null}

      <div
        data-testid="agent-thread-list-scroll"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin"
      >
        {showEmptyOrLoadStates ? (
          shouldShowEmptyState ? (
            <ConversationSidebarSection
              actions={listActions}
              label={isArchivedView ? 'Archived' : 'Recent'}
            >
              <AgentThreadListEmptyState
                isLoading={false}
                shouldShowLoadFailureState={false}
                shouldShowEmptyState
                onRetry={handleRetryLoad}
              />
            </ConversationSidebarSection>
          ) : (
            <AgentThreadListEmptyState
              actions={listActions}
              isLoading={isLoading && threads.length === 0}
              shouldShowLoadFailureState={shouldShowLoadFailureState}
              shouldShowEmptyState={false}
              onRetry={handleRetryLoad}
            />
          )
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
            className="flex flex-col gap-1 px-0.5 pb-3"
          >
            {isArchivedView ? (
              <ConversationSidebarSection
                actions={actionsSectionId === 'archived' ? listActions : null}
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
            {shouldGroupByBrand
              ? brandGroups.map((group) => (
                  <ConversationSidebarSection
                    key={group.brandId ?? 'organization'}
                    actions={
                      actionsSectionId === (group.brandId ?? 'organization')
                        ? listActions
                        : null
                    }
                    count={group.threads.length}
                    label={group.label}
                  >
                    {group.threads.map(renderThreadRow)}
                  </ConversationSidebarSection>
                ))
              : null}
            {!isArchivedView &&
            !shouldGroupByBrand &&
            groups.needsYou.length > 0 ? (
              <ConversationSidebarSection
                actions={actionsSectionId === 'needsYou' ? listActions : null}
                count={groups.needsYou.length}
                label="Needs you"
              >
                {groups.needsYou.map(renderThreadRow)}
              </ConversationSidebarSection>
            ) : null}
            {!isArchivedView &&
            !shouldGroupByBrand &&
            groups.working.length > 0 ? (
              <ConversationSidebarSection
                actions={actionsSectionId === 'working' ? listActions : null}
                count={groups.working.length}
                label="Working"
              >
                {groups.working.map(renderThreadRow)}
              </ConversationSidebarSection>
            ) : null}
            {!isArchivedView &&
            !shouldGroupByBrand &&
            groups.pinned.length > 0 ? (
              <ConversationSidebarSection
                actions={actionsSectionId === 'pinned' ? listActions : null}
                count={groups.pinned.length}
                label="Pinned"
              >
                {groups.pinned.map(renderThreadRow)}
              </ConversationSidebarSection>
            ) : null}
            {!isArchivedView &&
            !shouldGroupByBrand &&
            groups.recent.length > 0 ? (
              <ConversationSidebarSection
                actions={actionsSectionId === 'recent' ? listActions : null}
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
