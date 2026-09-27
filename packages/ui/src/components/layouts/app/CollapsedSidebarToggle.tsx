'use client';

import SidebarLogoToggleButton from '@ui/menus/sidebar-logo-toggle/SidebarLogoToggleButton';

type CollapsedSidebarToggleProps = {
  onClick: () => void;
};

export default function CollapsedSidebarToggle({
  onClick,
}: CollapsedSidebarToggleProps) {
  return (
    <SidebarLogoToggleButton
      ariaLabel="Expand sidebar"
      className="fixed z-[60] hidden md:flex"
      direction="expand"
      onClick={onClick}
      style={{
        left: 'calc(var(--desktop-rail-width, 0px) + 0.75rem)',
        top: 'calc(var(--desktop-titlebar-height) + 0.5rem)',
      }}
    />
  );
}
