'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { ChannelDropdownProps } from '@props/social/channel-dropdown.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ghostSelectTriggerClassName } from '@ui/primitives/field-control';
import { ChevronDown, Globe, LayoutGrid, Mail, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

const CHANNEL_ACCOUNT_PREFIX = 'account:';

function ChannelIcon({
  channel,
  className = 'size-4',
}: {
  channel: string;
  className?: string;
}) {
  const PlatformIcon = getPlatformIconComponent(channel);
  const Icon =
    PlatformIcon ??
    (channel === 'email' ? Mail : channel === 'web' ? Globe : Share2);
  return <Icon aria-hidden="true" className={className} />;
}

function AccountAvatar({
  account,
}: {
  account: ChannelDropdownProps['accounts'][number];
}) {
  return (
    <span className="relative shrink-0">
      <Avatar className="size-6 bg-background-secondary">
        {account.avatarUrl ? (
          <AvatarImage
            src={account.avatarUrl}
            alt=""
            className="object-cover"
          />
        ) : null}
        <AvatarFallback className="text-2xs font-semibold text-foreground/70">
          {account.label.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="absolute -bottom-1 -right-1 flex rounded-full bg-background p-px">
        <PlatformBadge
          platform={account.platform}
          showLabel={false}
          variant="solid"
          className="size-3.5 justify-center rounded-full p-0 [&_svg]:size-2"
        />
      </span>
    </span>
  );
}

/**
 * Channel picker: connected accounts first, each with its avatar and platform
 * badge, then every other channel (platforms, email, website) with its icon
 * under a "More" sub-menu.
 */
export default function DropdownChannel({
  accounts,
  ariaLabel,
  channels,
  className,
  value,
  onChange,
}: ChannelDropdownProps) {
  const translate = useTranslations('ui.channelDropdown');
  const selectedAccount = value.startsWith(CHANNEL_ACCOUNT_PREFIX)
    ? accounts.find(
        (account) => `${CHANNEL_ACCOUNT_PREFIX}${account.id}` === value,
      )
    : undefined;
  const selectedChannel = channels.find((channel) => channel.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          size={ButtonSize.SM}
          ariaLabel={ariaLabel}
          className={cn(
            'inline-flex items-center',
            ghostSelectTriggerClassName,
            className,
          )}
        >
          {selectedAccount ? (
            <AccountAvatar account={selectedAccount} />
          ) : selectedChannel ? (
            <ChannelIcon channel={selectedChannel.value} />
          ) : (
            <LayoutGrid aria-hidden="true" className="size-4" />
          )}
          <span className="max-w-32 truncate">
            {selectedAccount?.label ??
              selectedChannel?.label ??
              translate('allChannels')}
          </span>
          <ChevronDown aria-hidden="true" className="size-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem value="all">
            <span className="flex items-center gap-2">
              <LayoutGrid aria-hidden="true" className="size-4" />
              {translate('allChannels')}
            </span>
          </DropdownMenuRadioItem>
          {accounts.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                {translate('connectedAccounts')}
              </DropdownMenuLabel>
              {accounts.map((account) => (
                <DropdownMenuRadioItem
                  key={account.id}
                  aria-label={account.label}
                  value={`${CHANNEL_ACCOUNT_PREFIX}${account.id}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <AccountAvatar account={account} />
                    <span className="truncate">{account.label}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </>
          ) : null}
        </DropdownMenuRadioGroup>
        {channels.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {translate('more')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 min-w-48 overflow-y-auto">
                <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
                  {channels.map((channel) => (
                    <DropdownMenuRadioItem
                      key={channel.value}
                      value={channel.value}
                    >
                      <span className="flex items-center gap-2">
                        <ChannelIcon channel={channel.value} />
                        {channel.label}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
