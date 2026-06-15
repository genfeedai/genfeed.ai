import type { IDesktopWorkspace } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { HiOutlineFolderOpen } from 'react-icons/hi2';

interface SidebarWorkspaceListProps {
  activeWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  workspaces: IDesktopWorkspace[];
}

function SidebarWorkspaceList({
  activeWorkspaceId,
  onSelectWorkspace,
  workspaces,
}: SidebarWorkspaceListProps) {
  if (workspaces.length === 0) return null;

  return (
    <div className="sidebar-workspace-card">
      <span className="sidebar-section-label">Active Workspace</span>
      <div className="workspace-switch-list">
        {workspaces.slice(0, 5).map((workspace) => {
          const isActive = workspace.id === activeWorkspaceId;

          return (
            <Button
              ariaLabel={`Select ${workspace.name}`}
              className={`workspace-switch-item ${isActive ? 'active' : ''}`}
              key={workspace.id}
              onClick={() => onSelectWorkspace(workspace.id)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
            >
              <HiOutlineFolderOpen className="nav-icon-svg" />
              <span className="workspace-switch-copy">
                <strong>{workspace.name}</strong>
                <span className="muted-text">{workspace.path}</span>
              </span>
              <span
                className={`status-dot ${
                  workspace.linkedProjectId ? 'status-active' : 'status-pending'
                }`}
              />
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export default SidebarWorkspaceList;
