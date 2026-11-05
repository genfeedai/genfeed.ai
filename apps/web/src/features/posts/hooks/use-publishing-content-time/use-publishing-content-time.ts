'use client';

import { useViewerTimeZone } from '@genfeedai/hooks/ui/use-viewer-time-zone/use-viewer-time-zone';
import { useFormatter, useTranslations } from 'next-intl';
import type { PublishingContentTime } from '@/features/posts/props/publishing-content-entry.props';

function toDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * "Published …" when the post went out, "Goes out …" when it is scheduled,
 * in the viewer's time zone. `null` for a post with neither time.
 */
export function usePublishingContentTime(
  publishedAt: string | null | undefined,
  scheduledAt: string | null | undefined,
  dateStyle: 'full' | 'medium',
): PublishingContentTime | null {
  const translate = useTranslations('pages.posts.list.collection.statusTime');
  const format = useFormatter();
  const timeZone = useViewerTimeZone();
  const publishedDate = toDate(publishedAt);
  const date = publishedDate ?? toDate(scheduledAt);

  if (!date) {
    return null;
  }

  const isPublished = publishedDate !== null;
  return {
    date,
    isPublished,
    label: translate(isPublished ? 'published' : 'scheduled', {
      date: format.dateTime(date, { dateStyle, timeStyle: 'short', timeZone }),
    }),
  };
}
