'use client';

import { Search } from 'lucide-react';
import SidebarActionTrigger from '@/components/menus/sidebar-action-trigger/SidebarActionTrigger';
import { useCommandPalette } from '@/hooks/ui/use-command-palette/use-command-palette';

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
