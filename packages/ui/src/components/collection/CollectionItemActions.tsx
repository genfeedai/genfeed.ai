'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { CollectionItemActionsProps } from '@genfeedai/props/ui/collection/collection.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { EllipsisVertical } from 'lucide-react';

/**
 * One visible primary action and an overflow menu for everything else.
 * Destructive actions always sort to the bottom of the menu, below a
 * separator, so they are never one mis-click away.
 */
export default function CollectionItemActions({
  primary,
  overflow = [],
  overflowLabel = 'More actions',
  className,
}: CollectionItemActionsProps) {
  const regularActions = overflow.filter((action) => !action.isDestructive);
  const destructiveActions = overflow.filter((action) => action.isDestructive);

  if (!primary && overflow.length === 0) {
    return null;
  }

  return (
    // Stops a click on an action from also activating a clickable card/row.
    <div
      className={cn('flex shrink-0 items-center gap-1', className)}
      onClick={(event) => event.stopPropagation()}
    >
      {primary}

      {overflow.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ariaLabel={overflowLabel}
              icon={<EllipsisVertical className="size-4" />}
              size={ButtonSize.ICON}
              tooltip={overflowLabel}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-40"
            collisionPadding={8}
          >
            {regularActions.map((action) => (
              <DropdownMenuItem
                disabled={action.isDisabled}
                key={action.id}
                onSelect={action.onSelect}
              >
                {action.icon}
                {action.label}
              </DropdownMenuItem>
            ))}
            {regularActions.length > 0 && destructiveActions.length > 0 ? (
              <DropdownMenuSeparator />
            ) : null}
            {destructiveActions.map((action) => (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={action.isDisabled}
                key={action.id}
                onSelect={action.onSelect}
              >
                {action.icon}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
