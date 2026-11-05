'use client';

import { Badge } from '@ui/primitives/badge';
import Link from 'next/link';
import type { PublishingContentIdentityProps } from '@/features/posts/props/publishing-content-entry.props';
import PublishingContentChannels from './publishing-content-channels';
import { formatPublishingContentFormat } from './publishing-content-library.helpers';
import PublishingContentThumbnail from './publishing-content-thumbnail';

/**
 * One Posts library entry: the post's first media item (or a text mark when
 * it has none), the accounts it goes to, then its title and first line.
 */
export default function PublishingContentIdentity({
  accounts,
  channels,
  format,
  media,
  title,
  summary,
  titleHref,
}: PublishingContentIdentityProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {media !== undefined ? (
        <PublishingContentThumbnail media={media} />
      ) : null}
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
          <p className="mt-1 line-clamp-1 text-sm text-foreground/60">
            {summary}
          </p>
        ) : null}
      </div>
    </div>
  );
}
