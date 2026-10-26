'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@genfeedai/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@genfeedai/ui/primitives/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import type { ToolbarDropdownProps } from './types';

/**
 * Toolbar dropdown menu component
 */
export function ToolbarDropdown({ label, items }: ToolbarDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          className="text-muted-foreground hover:text-foreground"
        >
          {label}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[180px]">
        {items.map((item) => {
          if (item.separator) {
            return <DropdownMenuSeparator key={item.id} />;
          }

          return (
            <DropdownMenuItem
              key={item.id}
              className="gap-2.5 whitespace-nowrap"
              disabled={item.disabled}
              onSelect={() => item.onClick?.()}
            >
              <span className="size-4 shrink-0">{item.icon}</span>
              <span>{item.label}</span>
              {item.external && (
                <span className="ml-auto text-xs text-muted-foreground">↗</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
