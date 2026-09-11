'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AccountRowActionsMenuProps } from '@props/pages/brand-integrations.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { MoreVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getConnectionLabel } from './account-connection-status.util';

export default function AccountRowActionsMenu({
  connection,
  isReconnectDisabled,
  onDisconnect,
  onPostingTimes,
  onReconnect,
}: AccountRowActionsMenuProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const label = getConnectionLabel(connection);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={translate('moreActionsAria', { account: label })}
          className="size-7 shrink-0"
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={isReconnectDisabled}
          onSelect={() => onReconnect(connection)}
        >
          {translate('reconnect')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPostingTimes(connection)}>
          {translate('postingTimes')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onDisconnect(connection)}
        >
          {translate('disconnect')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
