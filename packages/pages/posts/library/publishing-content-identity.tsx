'use client';

import Link from 'next/link';
import PublishingContentChannels from './publishing-content-channels';

type PublishingContentIdentityProps = {
  channels: string[];
  title: string;
  summary?: string;
  titleHref?: string;
};

export default function PublishingContentIdentity({
  channels,
  title,
  summary,
  titleHref,
}: PublishingContentIdentityProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PublishingContentChannels channels={channels} />
      <div className="min-w-0 max-w-xl">
        {titleHref ? (
          <Link
            href={titleHref}
            aria-label={`Open ${title}`}
            className="line-clamp-1 text-sm font-medium text-foreground hover:underline"
          >
            {title}
          </Link>
        ) : (
          <p className="line-clamp-1 text-sm font-medium text-foreground">
            {title}
          </p>
        )}
        {summary ? (
          <p className="mt-1 line-clamp-1 text-sm text-foreground/55">
            {summary}
          </p>
        ) : null}
      </div>
    </div>
  );
}
