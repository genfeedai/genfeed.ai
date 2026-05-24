import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { HiOutlineCog6Tooth, HiOutlineCommandLine } from 'react-icons/hi2';
import { PiSidebarSimple, PiSidebarSimpleFill } from 'react-icons/pi';

interface TopbarProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onOpenTerminal: () => void;
}

export function Topbar({
  isSidebarCollapsed,
  onToggleSidebar,
  onOpenSettings,
  onOpenTerminal,
}: TopbarProps) {
  return (
    <div className="desktop-topbar">
      <div className="desktop-topbar-left">
        <Button
          className="desktop-topbar-icon-btn"
          onClick={onToggleSidebar}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          ariaLabel={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed ? (
            <PiSidebarSimple className="desktop-topbar-icon" />
          ) : (
            <PiSidebarSimpleFill className="desktop-topbar-icon" />
          )}
        </Button>
      </div>

      <div className="desktop-topbar-right">
        <Button
          className="desktop-topbar-icon-btn"
          onClick={onOpenTerminal}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          ariaLabel="Open terminal"
        >
          <HiOutlineCommandLine className="desktop-topbar-icon" />
        </Button>

        <Button
          className="desktop-topbar-icon-btn"
          onClick={onOpenSettings}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          ariaLabel="Settings"
        >
          <HiOutlineCog6Tooth className="desktop-topbar-icon" />
        </Button>
      </div>
    </div>
  );
}
