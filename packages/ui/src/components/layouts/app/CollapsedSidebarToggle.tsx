'use client';

import SidebarToggleButton from '@ui/menus/sidebar-toggle/SidebarToggleButton';

type CollapsedSidebarToggleProps = {
  onClick: () => void;
};

export default function CollapsedSidebarToggle({
  onClick,
}: CollapsedSidebarToggleProps) {
  return (
    <SidebarToggleButton
      ariaLabel="Expand sidebar"
      onClick={onClick}
      className="fixed left-3 z-[60] hidden md:flex"
      style={{ top: 'calc(var(--desktop-titlebar-height) + 0.5rem)' }}
    />
  );
}
