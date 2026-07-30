'use client';

import SidebarActionTrigger from '@ui/menus/sidebar-action-trigger/SidebarActionTrigger';
import { Search } from 'lucide-react';

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
      icon={<Search className="size-4 flex-shrink-0" />}
      label={label}
      shortcut="⌘K"
    />
  );
}
