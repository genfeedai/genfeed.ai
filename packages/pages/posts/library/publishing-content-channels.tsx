'use client';

import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { PublishingContentChannelsProps } from '@props/posts/publishing-content-entry.props';
import { Globe, Mail, Share2 } from 'lucide-react';
import { formatPublishingContentChannel } from './publishing-content-library.helpers';

const MAX_VISIBLE_CHANNELS = 3;

/** Stacked destination-channel icons for one Posts library entry. */
export default function PublishingContentChannels({
  channels,
}: PublishingContentChannelsProps) {
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
