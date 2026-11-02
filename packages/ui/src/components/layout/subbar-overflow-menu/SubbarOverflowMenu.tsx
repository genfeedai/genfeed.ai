'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { SubbarOverflowMenuProps } from '@props/layout/subbar-overflow-menu.props';
import { OverflowItem } from '@ui/collection/CollectionItemActions';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * The one "..." menu of a subbar. Secondary actions live here instead of as
 * loose ghost icons, so every page's bar has the same shape: this menu, then
 * Refresh, then the page's controls. Destructive actions sort to the bottom
 * below a separator.
 */
export default function SubbarOverflowMenu({
  actions,
  label,
}: SubbarOverflowMenuProps) {
  const translate = useTranslations('ui.collection');
  const triggerLabel = label ?? translate('moreActions');
  const regularActions = actions.filter((action) => !action.isDestructive);
  const destructiveActions = actions.filter((action) => action.isDestructive);

  if (actions.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ariaLabel={triggerLabel}
          icon={<Ellipsis className="size-4" />}
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
  );
}
