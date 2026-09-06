'use client';

import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import { Globe, Mail, Share2 } from 'lucide-react';
import { formatPublishingContentChannel } from './publishing-content-library.helpers';

type PublishingContentIdentityProps = {
  channels: string[];
  title: string;
  summary?: string;
};

export default function PublishingContentIdentity({
  channels,
  title,
  summary,
}: PublishingContentIdentityProps) {
  const uniqueChannels = [...new Set(channels.length ? channels : ['social'])];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex shrink-0 -space-x-2">
        {uniqueChannels.slice(0, 3).map((channel) => {
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
        {uniqueChannels.length > 3 ? (
          <span className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-xs">
            +{uniqueChannels.length - 3}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 max-w-xl">
        <p className="line-clamp-1 text-sm font-medium text-foreground">
          {title}
        </p>
        {summary ? (
          <p className="mt-1 line-clamp-1 text-sm text-foreground/55">
            {summary}
          </p>
        ) : null}
      </div>
    </div>
  );
}
