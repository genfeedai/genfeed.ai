import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { type ReactElement, type ReactNode, useEffect, useMemo } from 'react';
import { AgentThreadListEmptyState } from './AgentThreadListEmptyState';
import { AgentThreadListErrorBanner } from './AgentThreadListErrorBanner';
import { AgentThreadListHeaderActions } from './AgentThreadListHeaderActions';
import { AgentThreadListRow } from './AgentThreadListRow';
import { AGENT_REFRESH_CONVERSATIONS_EVENT } from './agent-thread-list.helpers';
import { useAgentThreadList } from './useAgentThreadList';

interface AgentThreadListProps {
  apiService: AgentApiService;
  isActive?: boolean;
  onNavigate?: (path: string) => void;
  onActionsChange?: (actions: ReactNode) => void;
}

export { AGENT_REFRESH_CONVERSATIONS_EVENT };

export function AgentThreadList({
  apiService,
  isActive = true,
  onNavigate,
  onActionsChange,
}: AgentThreadListProps): ReactElement {
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
  } = useAgentThreadList({ apiService, isActive, onNavigate });

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
                {pinnedThreads.map((conv) => (
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
                ))}
              </div>
            ) : null}
            {pinnedThreads.length > 0 && regularThreads.length > 0 ? (
              <div aria-hidden="true" className="mx-1 border-t border-border" />
            ) : null}
            <div className="flex flex-col gap-0.5">
              {regularThreads.map((conv) => (
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
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
