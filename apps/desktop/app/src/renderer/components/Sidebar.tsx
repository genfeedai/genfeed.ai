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
import SidebarFooter from './SidebarFooter';
import SidebarThreadList from './SidebarThreadList';
import SidebarWorkspaceList from './SidebarWorkspaceList';

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

interface SidebarProps {
  activeView: NavView;
  activeThreadId: string | null;
  isCollapsed: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  activeWorkspaceId: string | null;
  onNavigate: (view: NavView) => void;
  onSelectThread: (threadId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
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

export function Sidebar({
  activeView,
  activeThreadId,
  activeWorkspaceId,
  isCollapsed,
  isSyncing,
  lastSyncAt,
  onNavigate,
  onSelectThread,
  onSelectWorkspace,
  onNewThread,
  onOpenWorkspace,
  onLogout,
  onTriggerSync,
  session,
  syncErrors,
  syncState,
  threads,
  workspaces,
}: SidebarProps) {
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

      {!isCollapsed && (
        <SidebarWorkspaceList
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={onSelectWorkspace}
          workspaces={workspaces}
        />
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

          <SidebarThreadList
            activeThreadId={activeThreadId}
            activeView={activeView}
            onSelectThread={onSelectThread}
            threads={threads}
            workspaces={workspaces}
          />
        </>
      )}

      <SidebarFooter
        isCollapsed={isCollapsed}
        isSyncing={isSyncing}
        lastSyncAt={lastSyncAt}
        onLogout={onLogout}
        onTriggerSync={onTriggerSync}
        session={session}
        syncErrors={syncErrors}
        syncState={syncState}
      />
    </aside>
  );
}
