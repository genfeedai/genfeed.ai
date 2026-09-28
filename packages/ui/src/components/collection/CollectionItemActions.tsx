'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  CollectionItemActionsProps,
  CollectionOverflowItemProps,
} from '@genfeedai/props/ui/collection/collection.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { EllipsisVertical } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * A destination renders as a real link inside the menu item, so the browser
 * keeps its link affordances; a command runs `onSelect` in place.
 */
function OverflowItem({ action, className }: CollectionOverflowItemProps) {
  if (action.href !== undefined) {
    return (
      <DropdownMenuItem
        asChild
        className={className}
        disabled={action.isDisabled}
      >
        <Link
          aria-disabled={action.isDisabled || undefined}
          href={action.href}
          rel={action.isExternal ? 'noopener noreferrer' : undefined}
          target={action.isExternal ? '_blank' : undefined}
        >
          {action.icon}
          {action.label}
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      className={className}
      disabled={action.isDisabled}
      onSelect={action.onSelect}
    >
      {action.icon}
      {action.label}
    </DropdownMenuItem>
  );
}

/**
 * One visible primary action and an overflow menu for everything else.
 * Destructive actions always sort to the bottom of the menu, below a
 * separator, so they are never one mis-click away.
 */
export default function CollectionItemActions({
  primary,
  overflow = [],
  overflowLabel,
  className,
}: CollectionItemActionsProps) {
  const translate = useTranslations('ui.collection');
  const triggerLabel = overflowLabel ?? translate('moreActions');
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
              ariaLabel={triggerLabel}
              icon={<EllipsisVertical className="size-4" />}
              size={ButtonSize.ICON}
              tooltip={triggerLabel}
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
              <OverflowItem action={action} key={action.id} />
            ))}
            {regularActions.length > 0 && destructiveActions.length > 0 ? (
              <DropdownMenuSeparator />
            ) : null}
            {destructiveActions.map((action) => (
              <OverflowItem
                action={action}
                className="text-destructive focus:text-destructive"
                key={action.id}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
