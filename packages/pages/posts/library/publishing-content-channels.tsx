'use client';

import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { PublishingContentChannelsProps } from '@props/posts/publishing-content-entry.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Globe, Mail, Share2 } from 'lucide-react';
import { formatPublishingContentChannel } from './publishing-content-library.helpers';

const MAX_VISIBLE_CHANNELS = 3;

/**
 * Target accounts for one Posts library entry: stacked avatars with a platform
 * badge when the accounts are known, otherwise stacked platform icons.
 */
export default function PublishingContentChannels({
  accounts,
  channels,
}: PublishingContentChannelsProps) {
  if (accounts && accounts.length > 0) {
    return (
      <div className="flex shrink-0 -space-x-2">
        {accounts.slice(0, MAX_VISIBLE_CHANNELS).map((account) => (
          <span
            key={account.id}
            className="relative shrink-0"
            title={account.label}
          >
            <Avatar className="size-9 border border-border bg-background">
              {account.avatarUrl ? (
                <AvatarImage
                  src={account.avatarUrl}
                  alt={account.label}
                  className="object-cover"
                />
              ) : null}
              <AvatarFallback className="text-2xs font-semibold text-foreground/70">
                {account.label.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -right-1 flex rounded-full bg-background p-0.5">
              <PlatformBadge
                platform={account.platform}
                showLabel={false}
                variant="solid"
                className="size-4 justify-center rounded-full p-0 [&_svg]:size-2.5"
              />
            </span>
          </span>
        ))}
        {accounts.length > MAX_VISIBLE_CHANNELS ? (
          <span className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-xs">
            +{accounts.length - MAX_VISIBLE_CHANNELS}
          </span>
        ) : null}
      </div>
    );
  }

  const uniqueChannels = [...new Set(channels.length ? channels : ['social'])];

  return (
    <div className="flex shrink-0 -space-x-2">
      {uniqueChannels.slice(0, MAX_VISIBLE_CHANNELS).map((channel) => {
        const Icon =
          getPlatformIconComponent(channel) ??
          (channel === 'email' ? Mail : channel === 'web' ? Globe : Share2);
        const label = formatPublishingContentChannel(channel);
        return (
          <span
            key={channel}
            role="img"
            aria-label={label}
            title={label}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background"
          >
            <Icon className="size-4" />
          </span>
        );
      })}
      {uniqueChannels.length > MAX_VISIBLE_CHANNELS ? (
        <span className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-xs">
          +{uniqueChannels.length - MAX_VISIBLE_CHANNELS}
        </span>
      ) : null}
    </div>
  );
}
