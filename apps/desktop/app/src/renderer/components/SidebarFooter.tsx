import type {
  IDesktopSession,
  IDesktopSyncState,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { HiArrowRightOnRectangle } from 'react-icons/hi2';

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

interface SidebarFooterProps {
  isCollapsed: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  onLogout: () => void;
  onTriggerSync: () => void;
  session: IDesktopSession | null;
  syncErrors: string[];
  syncState: IDesktopSyncState;
}

function SidebarFooter({
  isCollapsed,
  isSyncing,
  lastSyncAt,
  onLogout,
  onTriggerSync,
  session,
  syncErrors,
  syncState,
}: SidebarFooterProps) {
  return (
    <div className="sidebar-footer">
      {!isCollapsed && isSyncing && (
        <div className="sync-indicator">
          <span className="sync-dot sync-dot-active" />
          Syncing…
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
      {!isCollapsed && !isSyncing && syncErrors.length === 0 && lastSyncAt && (
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
  );
}

export default SidebarFooter;
