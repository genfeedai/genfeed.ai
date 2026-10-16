'use client';

import { useCommandPalette } from '@genfeedai/hooks/ui/use-command-palette/use-command-palette';
import SidebarActionTrigger from '@ui/menus/sidebar-action-trigger/SidebarActionTrigger';
import { Search } from 'lucide-react';

interface SidebarSearchTriggerProps {
  className?: string;
  isDisabled?: boolean;
  label?: string;
}

export default function SidebarSearchTrigger({
  className,
  isDisabled = false,
  label = 'Search',
}: SidebarSearchTriggerProps) {
  const { open } = useCommandPalette();

  return (
    <SidebarActionTrigger
      onClick={open}
      ariaLabel="Open command palette"
      isDisabled={isDisabled}
      className={className}
      icon={<Search className="size-4 flex-shrink-0" />}
      label={label}
      shortcut="⌘K"
    />
  );
}
