import type {
  IDesktopThread,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { HiFolderOpen } from 'react-icons/hi2';

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

interface SidebarThreadListProps {
  activeThreadId: string | null;
  activeView: string;
  onSelectThread: (threadId: string) => void;
  threads: IDesktopThread[];
  workspaces: IDesktopWorkspace[];
}

function SidebarThreadList({
  activeThreadId,
  activeView,
  onSelectThread,
  threads,
  workspaces,
}: SidebarThreadListProps) {
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
    <div className="sidebar-threads">
      <span className="sidebar-section-label">Conversations</span>

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
        );
      })}

      {ungrouped.length > 0 && (
        <div className="thread-group">
          {workspaces.length > 0 && (
            <span className="thread-group-label">General</span>
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
                <span className="thread-time">{timeAgo(thread.updatedAt)}</span>
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
  );
}

export default SidebarThreadList;
