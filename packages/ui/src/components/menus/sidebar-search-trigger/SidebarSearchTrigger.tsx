'use client';

import SidebarActionTrigger from '@ui/menus/sidebar-action-trigger/SidebarActionTrigger';
import { HiMagnifyingGlass } from 'react-icons/hi2';

interface SidebarSearchTriggerProps {
  onClick: () => void;
  className?: string;
  label?: string;
}

export default function SidebarSearchTrigger({
  onClick,
  className,
  label = 'Search',
}: SidebarSearchTriggerProps) {
  return (
    <SidebarActionTrigger
      onClick={onClick}
      ariaLabel="Open command palette"
      className={className}
      icon={<HiMagnifyingGlass className="size-4 flex-shrink-0" />}
      label={label}
      shortcut="⌘K"
    />
  );
}
