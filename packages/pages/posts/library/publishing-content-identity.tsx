'use client';

import type { PublishingContentIdentityProps } from '@props/posts/publishing-content-entry.props';
import Badge from '@ui/display/badge/Badge';
import Link from 'next/link';
import PublishingContentChannels from './publishing-content-channels';
import { formatPublishingContentFormat } from './publishing-content-library.helpers';

export default function PublishingContentIdentity({
  accounts,
  channels,
  format,
  title,
  summary,
  titleHref,
}: PublishingContentIdentityProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PublishingContentChannels accounts={accounts} channels={channels} />
      <div className="min-w-0 max-w-xl">
        <div className="flex min-w-0 items-center gap-2">
          {titleHref ? (
            <Link
              href={titleHref}
              aria-label={`Open ${title}`}
              className="line-clamp-2 text-sm font-medium md:line-clamp-1 text-foreground hover:underline"
            >
              {title}
            </Link>
          ) : (
            <p className="line-clamp-2 text-sm font-medium md:line-clamp-1 text-foreground">
              {title}
            </p>
          )}
          {format ? (
            <Badge className="shrink-0">
              {formatPublishingContentFormat(format)}
            </Badge>
          ) : null}
        </div>
        {summary ? (
          <p className="mt-1 line-clamp-1 text-sm text-foreground/55">
            {summary}
          </p>
        ) : null}
      </div>
    </div>
  );
}
