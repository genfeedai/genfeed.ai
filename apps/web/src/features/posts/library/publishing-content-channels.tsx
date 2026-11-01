'use client';

import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar } from '@ui/primitives/avatar';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { Globe, Mail, Share2 } from 'lucide-react';
import type { PublishingContentChannelsProps } from '@/features/posts/props/publishing-content-entry.props';
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
          <Avatar
            key={account.id}
            alt={account.label}
            badge={
              <PlatformBadge
                platform={account.platform}
                showLabel={false}
                variant="solid"
              />
            }
            name={account.label}
            size="lg"
            src={account.avatarUrl}
            title={account.label}
          />
        ))}
        {accounts.length > MAX_VISIBLE_CHANNELS ? (
          <Avatar
            fallback={`+${accounts.length - MAX_VISIBLE_CHANNELS}`}
            size="lg"
          />
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
          <SimpleTooltip key={channel} label={label}>
            <span
              role="img"
              aria-label={label}
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background"
            >
              <Icon className="size-4" />
            </span>
          </SimpleTooltip>
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
