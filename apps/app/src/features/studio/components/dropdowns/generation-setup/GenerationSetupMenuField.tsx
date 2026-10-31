'use client';

import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@ui/primitives/dropdown-menu';
import type { ReactNode } from 'react';

/**
 * One row of a setup menu: its label and current value, opening a nested
 * submenu to the side. Radix opens it on hover and closes it when another
 * row takes over, so only one submenu is ever open; click and the right
 * arrow key work too.
 */
export default function GenerationSetupMenuField({
  children,
  icon,
  label,
  value,
}: {
  children: ReactNode;
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="min-h-9 gap-2 text-xs">
        {icon}
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span className="truncate">{label}</span>
          <span className="truncate text-muted-foreground">{value}</span>
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="p-0" sideOffset={6}>
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
