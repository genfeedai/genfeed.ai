'use client';

import SidebarLogoToggleButton from '@ui/menus/sidebar-logo-toggle/SidebarLogoToggleButton';

type CollapsedSidebarLogoToggleProps = {
  onClick: () => void;
};

export default function CollapsedSidebarLogoToggle({
  onClick,
}: CollapsedSidebarLogoToggleProps) {
  return (
    <SidebarLogoToggleButton
      ariaLabel="Expand sidebar"
      direction="expand"
      onClick={onClick}
      className="fixed left-2 z-[60] hidden md:flex"
      style={{ top: 'calc(var(--desktop-titlebar-height) + 0.5rem)' }}
    />
  );
}
