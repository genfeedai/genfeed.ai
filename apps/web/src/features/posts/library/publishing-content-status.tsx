'use client';

import { useViewerTimeZone } from '@genfeedai/hooks/ui/use-viewer-time-zone/use-viewer-time-zone';
import { Badge } from '@ui/primitives/badge';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { useFormatter, useTranslations } from 'next-intl';
import { formatPublishingContentStatus } from '@/features/posts/library/publishing-content-library.helpers';
import type { PublishingContentStatusProps } from '@/features/posts/props/publishing-content-entry.props';

function toDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

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
  const translate = useTranslations('pages.posts.list.collection.statusTime');
  const format = useFormatter();
  const timeZone = useViewerTimeZone();
  const publishedDate = toDate(publishedAt);
  const date = publishedDate ?? toDate(scheduledAt);
  const timeLabel = date
    ? translate(publishedDate ? 'published' : 'scheduled', {
        date: format.dateTime(date, {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone,
        }),
      })
    : null;

  return (
    <SimpleTooltip label={timeLabel ?? undefined}>
      <span className="inline-flex">
        <Badge status={status}>{formatPublishingContentStatus(status)}</Badge>
        {date && timeLabel ? (
          <time className="sr-only" dateTime={date.toISOString()}>
            {timeLabel}
          </time>
        ) : null}
      </span>
    </SimpleTooltip>
  );
}
