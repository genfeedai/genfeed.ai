'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@genfeedai/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@genfeedai/ui/primitives/dropdown-menu';
import { EllipsisVertical } from 'lucide-react';
import type { OverflowMenuProps } from './types';

/**
 * Overflow menu with icon trigger
 */
export function OverflowMenu({ items }: OverflowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          title="More options"
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[180px]">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            className="gap-2.5"
            onSelect={() => item.onClick?.()}
          >
            <span className="size-4 shrink-0">{item.icon}</span>
            <span>{item.label}</span>
            {item.external && (
              <span className="ml-auto text-xs text-muted-foreground">↗</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
