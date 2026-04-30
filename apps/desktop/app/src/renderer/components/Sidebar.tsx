import type {
  IDesktopSession,
  IDesktopSyncState,
  IDesktopThread,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import type { NavView } from '@renderer/nav-view';
import { Button } from '@ui/primitives/button';
import type { ComponentType } from 'react';
import {
  HiArrowRightOnRectangle,
  HiBolt,
  HiChartBar,
  HiCpuChip,
  HiFolderOpen,
  HiOutlineBolt,
  HiOutlineChartBar,
  HiOutlineCpuChip,
  HiOutlineFolderOpen,
  HiOutlinePlusCircle,
  HiOutlineRocketLaunch,
  HiOutlineSquares2X2,
  HiRocketLaunch,
  HiSquares2X2,
} from 'react-icons/hi2';

interface NavItem {
  id: NavView;
  label: string;
  outline: ComponentType<{ className?: string }>;
  solid: ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'workflows',
    label: 'Automations',
    outline: HiOutlineBolt,
    solid: HiBolt,
  },
  {
    id: 'agents',
    label: 'Agents',
    outline: HiOutlineCpuChip,
    solid: HiCpuChip,
  },
  {
    id: 'mission-control',
    label: 'Mission Control',
    outline: HiOutlineRocketLaunch,
    solid: HiRocketLaunch,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    outline: HiOutlineChartBar,
    solid: HiChartBar,
  },
  {
    id: 'library',
    label: 'Library',
    outline: HiOutlineFolderOpen,
    solid: HiFolderOpen,
  },
  {
    id: 'trends',
    label: 'Trends',
    outline: HiOutlineSquares2X2,
    solid: HiSquares2X2,
  },
];

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

interface SidebarProps {
  activeView: NavView;
  activeThreadId: string | null;
  isCollapsed: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  onNavigate: (view: NavView) => void;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onOpenWorkspace: () => void;
  onLogout: () => void;
  onTriggerSync: () => void;
  session: IDesktopSession | null;
  syncErrors: string[];
  syncState: IDesktopSyncState;
  threads: IDesktopThread[];
  workspaces: IDesktopWorkspace[];
}

export const Sidebar = ({
  activeView,
  activeThreadId,
  isCollapsed,
  isSyncing,
  lastSyncAt,
  onNavigate,
  onSelectThread,
  onNewThread,
  onOpenWorkspace,
  onLogout,
  onTriggerSync,
  session,
  syncErrors,
  syncState,
  threads,
  workspaces,
}: SidebarProps) => {
  // Group threads by workspace
  const threadsByWorkspace = new Map<string, IDesktopThread[]>();
  const ungrouped: IDesktopThread[] = [];

  for (const thread of threads) {
    if (thread.workspaceId) {
      const existing = threadsByWorkspace.get(thread.workspaceId) ?? [];
      existing.push(thread);
      threadsByWorkspace.set(thread.workspaceId, existing);
    } else {
      ungrouped.push(thread);
    }
  }

  return (
    <aside className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      {!isCollapsed && (
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span className="logo-mark">G</span>
            <span className="logo-text">GenFeed</span>
          </div>
        </div>
      )}

      {/* New thread button */}
      {!isCollapsed ? (
        <>
          <Button
            className="new-thread-button"
            onClick={onNewThread}
            type="button"
            variant={ButtonVariant.UNSTYLED}
          >
            <HiOutlinePlusCircle className="nav-icon-svg" /> New thread
          </Button>
          <Button
            className="sidebar-action-button"
            onClick={onOpenWorkspace}
            type="button"
            variant={ButtonVariant.GHOST}
          >
            <HiOutlineFolderOpen className="nav-icon-svg" />
            <span>Open workspace</span>
          </Button>
        </>
      ) : (
        <Button
          className="sidebar-action-collapsed"
          onClick={onNewThread}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          ariaLabel="New thread"
        >
          <HiOutlinePlusCircle className="nav-icon-svg" />
        </Button>
      )}

      {!isCollapsed && workspaces[0] && (
        <div className="sidebar-workspace-card">
          <span className="sidebar-section-label">Active Workspace</span>
          <strong>{workspaces[0].name}</strong>
          <span className="muted-text">{workspaces[0].path}</span>
          {workspaces[0].linkedProjectId ? (
            <span className="status-badge status-active">
              Linked to project
            </span>
          ) : (
            <span className="status-badge status-pending">
              Project link pending
            </span>
          )}
        </div>
      )}

      {/* Nav items */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const IconComponent = isActive ? item.solid : item.outline;

          return (
            <Button
              className={`nav-item ${isActive ? 'active' : ''}`}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              ariaLabel={isCollapsed ? item.label : undefined}
            >
              <IconComponent className="nav-icon-svg" />
              {!isCollapsed && <span className="nav-label">{item.label}</span>}
            </Button>
          );
        })}
      </nav>

      {!isCollapsed && (
        <>
          {/* Divider */}
          <div className="sidebar-divider" />

          {/* Conversations section */}
          <div className="sidebar-threads">
            <span className="sidebar-section-label">Conversations</span>

            {/* Grouped by workspace */}
            {workspaces.map((ws) => {
              const wsThreads = threadsByWorkspace.get(ws.id);
              if (!wsThreads || wsThreads.length === 0) return null;

              return (
                <div className="thread-group" key={ws.id}>
                  <span className="thread-group-label">
                    <HiFolderOpen className="nav-icon-svg" /> {ws.name}
                  </span>
                  {wsThreads.map((thread) => (
                    <Button
                      className={`thread-item ${
                        activeView === 'conversation' &&
                        activeThreadId === thread.id
                          ? 'active'
                          : ''
                      }`}
                      key={thread.id}
                      onClick={() => onSelectThread(thread.id)}
                      type="button"
                      variant={ButtonVariant.UNSTYLED}
                    >
                      <span className="thread-title">{thread.title}</span>
                      <span className="thread-meta">
                        <span className="thread-time">
                          {timeAgo(thread.updatedAt)}
                        </span>
                        {thread.status === 'awaiting-response' && (
                          <span className="thread-status-badge">Awaiting</span>
                        )}
                      </span>
                    </Button>
                  ))}
                </div>
              );
            })}

            {/* Ungrouped threads */}
            {ungrouped.length > 0 && (
              <div className="thread-group">
                {workspaces.length > 0 && (
                  <span className="thread-group-label">General</span>
                )}
                {ungrouped.map((thread) => (
                  <Button
                    className={`thread-item ${
                      activeView === 'conversation' &&
                      activeThreadId === thread.id
                        ? 'active'
                        : ''
                    }`}
                    key={thread.id}
                    onClick={() => onSelectThread(thread.id)}
                    type="button"
                    variant={ButtonVariant.UNSTYLED}
                  >
                    <span className="thread-title">{thread.title}</span>
                    <span className="thread-meta">
                      <span className="thread-time">
                        {timeAgo(thread.updatedAt)}
                      </span>
                      {thread.status === 'awaiting-response' && (
                        <span className="thread-status-badge">Awaiting</span>
                      )}
                    </span>
                  </Button>
                ))}
              </div>
            )}

            {threads.length === 0 && (
              <p className="empty-state sidebar-empty">
                No conversations yet. Click &quot;New thread&quot; to start.
              </p>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="sidebar-footer">
        {/* Cloud sync status */}
        {!isCollapsed && isSyncing && (
          <div className="sync-indicator">
            <span className="sync-dot sync-dot-active" />
            Syncing...
          </div>
        )}
        {!isCollapsed && !isSyncing && syncErrors.length > 0 && (
          <div className="sync-indicator sync-indicator-error">
            <span>Sync error</span>
            <Button
              className="sync-retry-btn"
              onClick={onTriggerSync}
              type="button"
              variant={ButtonVariant.UNSTYLED}
            >
              Retry
            </Button>
          </div>
        )}
        {!isCollapsed &&
          !isSyncing &&
          syncErrors.length === 0 &&
          lastSyncAt && (
            <div className="sync-indicator sync-indicator-success">
              <span>Synced {timeAgo(lastSyncAt)}</span>
              <Button
                className="sync-manual-btn"
                onClick={onTriggerSync}
                title="Sync now"
                type="button"
                variant={ButtonVariant.UNSTYLED}
              >
                ⟳
              </Button>
            </div>
          )}

        {/* Local job queue indicator */}
        {!isCollapsed && syncState.pendingCount > 0 && (
          <div className="sync-indicator">
            <span className="sync-dot" />
            {syncState.pendingCount} pending
          </div>
        )}

        {!isCollapsed && (
          <div className="user-info">
            <span className="user-avatar">
              {session
                ? (session.userName ??
                    session.userEmail ??
                    'U')[0].toUpperCase()
                : '?'}
            </span>
            <div className="user-details">
              <span className="user-name">
                {session?.userName ?? (session ? 'User' : 'Offline')}
              </span>
              <span className="user-email">{session?.userEmail ?? ''}</span>
            </div>
          </div>
        )}

        <Button
          className="nav-item logout-btn"
          onClick={onLogout}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          ariaLabel={isCollapsed ? 'Sign Out' : undefined}
        >
          <HiArrowRightOnRectangle className="nav-icon-svg" />
          {!isCollapsed && <span className="nav-label">Sign Out</span>}
        </Button>
      </div>
    </aside>
  );
};
