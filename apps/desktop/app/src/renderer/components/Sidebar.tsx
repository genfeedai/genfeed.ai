import type {
  IDesktopSession,
  IDesktopSyncState,
  IDesktopThread,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import type { NavView } from '@renderer/nav-view';
import { Button } from '@ui/primitives/button';

interface NavItem {
  icon: string;
  id: NavView;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: '⚡', id: 'workflows', label: 'Automations' },
  { icon: '🤖', id: 'agents', label: 'Agents' },
  { icon: '🧪', id: 'mission-control', label: 'Mission Control' },
  { icon: '📊', id: 'analytics', label: 'Analytics' },
  { icon: '📂', id: 'library', label: 'Library' },
  { icon: '📈', id: 'trends', label: 'Trends' },
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
  onNavigate: (view: NavView) => void;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onOpenWorkspace: () => void;
  onLogout: () => void;
  session: IDesktopSession | null;
  syncState: IDesktopSyncState;
  threads: IDesktopThread[];
  workspaces: IDesktopWorkspace[];
}

export const Sidebar = ({
  activeView,
  activeThreadId,
  onNavigate,
  onSelectThread,
  onNewThread,
  onOpenWorkspace,
  onLogout,
  session,
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
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-mark">G</span>
        <span className="logo-text">GenFeed</span>
      </div>

      {/* New thread button */}
      <Button
        className="new-thread-button"
        onClick={onNewThread}
        type="button"
        variant={ButtonVariant.UNSTYLED}
      >
        <span>＋</span> New thread
      </Button>
      <Button
        className="sidebar-action-button"
        onClick={onOpenWorkspace}
        type="button"
        variant={ButtonVariant.GHOST}
      >
        <span className="nav-icon">📁</span>
        <span>Open workspace</span>
      </Button>

      {workspaces[0] && (
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
        {NAV_ITEMS.map((item) => (
          <Button
            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
            key={item.id}
            onClick={() => onNavigate(item.id)}
            type="button"
            variant={ButtonVariant.UNSTYLED}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </Button>
        ))}
      </nav>

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
                <span className="nav-icon">📁</span> {ws.name}
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
              <span className="thread-group-label">
                <span className="nav-icon">💬</span> General
              </span>
            )}
            {ungrouped.map((thread) => (
              <Button
                className={`thread-item ${
                  activeView === 'conversation' && activeThreadId === thread.id
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
            No conversations yet. Click "New thread" to start.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        {syncState.pendingCount > 0 && (
          <div className="sync-indicator">
            <span className="sync-dot" />
            {syncState.pendingCount} pending
          </div>
        )}

        <div className="user-info">
          <span className="user-avatar">
            {session
              ? (session.userName ?? session.userEmail ?? 'U')[0].toUpperCase()
              : '?'}
          </span>
          <div className="user-details">
            <span className="user-name">
              {session?.userName ?? (session ? 'User' : 'Offline')}
            </span>
            <span className="user-email">{session?.userEmail ?? ''}</span>
          </div>
        </div>

        <Button
          className="nav-item logout-btn"
          onClick={onLogout}
          type="button"
          variant={ButtonVariant.UNSTYLED}
        >
          <span className="nav-icon">🚪</span>
          <span className="nav-label">Sign Out</span>
        </Button>
      </div>
    </aside>
  );
};
