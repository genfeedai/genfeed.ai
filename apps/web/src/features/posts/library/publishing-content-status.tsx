'use client';

import { Badge } from '@ui/primitives/badge';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { usePublishingContentTime } from '@/features/posts/hooks/use-publishing-content-time/use-publishing-content-time';
import { formatPublishingContentStatus } from '@/features/posts/library/publishing-content-library.helpers';
import type { PublishingContentStatusProps } from '@/features/posts/props/publishing-content-entry.props';

/**
 * One status cell for a post row: the badge says where the post is, and
 * hovering it says when it went out or when it goes out. The time is also in
 * the cell for screen readers.
 */
export default function PublishingContentStatus({
  status,
  publishedAt,
  scheduledAt,
}: PublishingContentStatusProps) {
  const time = usePublishingContentTime(publishedAt, scheduledAt, 'full');

  return (
    <SimpleTooltip label={time?.label}>
      <span className="inline-flex">
        <Badge status={status}>{formatPublishingContentStatus(status)}</Badge>
        {time ? (
          <time className="sr-only" dateTime={time.date.toISOString()}>
            {time.label}
          </time>
        ) : null}
      </span>
    </SimpleTooltip>
  );
}
