import {
  createPublishingContentLibraryItems,
  filterPublishingContentLibraryItems,
  parsePublishingContentType,
  publishingContentTitle,
} from '@pages/posts/library/publishing-content-library.helpers';
import { releaseScheduledInstant } from '@pages/posts/shared/release-status.helpers';
import type { ContentCalendarItemsOptions } from '@props/publishing/content-calendar-controller.props';
import type {
  ArticleContentCalendarItem,
  ContentCalendarItem,
  DayAggregateContentCalendarItem,
  NewsletterContentCalendarItem,
  ReleaseContentCalendarItem,
  SlotContentCalendarItem,
} from '@props/publishing/content-calendar-page.props';
import {
  aggregateCalendarItemsByDay,
  isMissingCalendarSlot,
  isUnfilledCalendarSlot,
} from './calendar-day-aggregate';

export function buildContentCalendarItems({
  articles,
  newsletters,
  releases,
  slots,
  globalFilterQuery,
  calendarView,
  translate,
}: ContentCalendarItemsOptions): ContentCalendarItem[] {
  const params = new URLSearchParams(globalFilterQuery);
  const globalItems = filterPublishingContentLibraryItems(
    createPublishingContentLibraryItems({
      articles,
      newsletters,
      posts: [],
      releases,
    }),
    {
      type: parsePublishingContentType(params.get('type')),
      status: (params.getAll('status').length
        ? params.getAll('status')
        : params.getAll('executionState')
      ).map((value) => (value === 'public' ? 'published' : value)),
      search: params.get('search') ?? '',
      channel: params.get('platform') ?? 'all',
    },
  );
  const visibleIds = new Set(globalItems.map((item) => item.id));
  const newsletterItems: NewsletterContentCalendarItem[] = newsletters
    .filter(
      (newsletter) =>
        visibleIds.has(newsletter.id) &&
        (newsletter.scheduledFor || newsletter.publishedAt),
    )
    .map((newsletter) => ({
      id: newsletter.id,
      itemType: 'newsletter',
      newsletter,
      scheduledDate: newsletter.scheduledFor || newsletter.publishedAt,
      status: newsletter.status,
      title: newsletter.label,
    }));
  const articleItems: ArticleContentCalendarItem[] = articles
    .filter((article) => visibleIds.has(article.id))
    .map((article) => ({
      article,
      id: article.id,
      itemType: 'article',
      scheduledDate: article.createdAt,
      status: article.status,
      title: article.label,
    }));

  const releaseItems: ReleaseContentCalendarItem[] = releases
    .filter((release) => visibleIds.has(release.id))
    .map((release) => ({
      id: release.id,
      itemType: 'release',
      release,
      scheduledDate: releaseScheduledInstant(release),
      status: release.status,
      title: publishingContentTitle(release.title),
    }));

  const slotItems: SlotContentCalendarItem[] = slots
    .filter(
      () =>
        !globalFilterQuery ||
        (params.get('type') !== 'article' &&
          params.get('type') !== 'newsletter' &&
          !params.has('status') &&
          !params.has('search') &&
          !params.has('platform')),
    )
    .map((slot) => ({
      id: slot.identityKey,
      itemType: 'slot',
      scheduledDate: slot.instant,
      slot,
      status: slot.state,
      title: slot.format,
    }));

  if (calendarView !== 'month') {
    return [...releaseItems, ...articleItems, ...newsletterItems, ...slotItems];
  }

  const aggregates = aggregateCalendarItemsByDay([
    ...releaseItems.map((item) => ({
      instant: String(item.scheduledDate ?? ''),
      kind: 'filled' as const,
    })),
    ...[...articleItems, ...newsletterItems].map((item) => ({
      instant: String(item.scheduledDate ?? ''),
      kind: 'filled' as const,
    })),
    ...slotItems
      .filter((item) => isUnfilledCalendarSlot(item.slot))
      .map((item) => ({
        identityKey: isMissingCalendarSlot(item.slot)
          ? item.slot.identityKey
          : undefined,
        instant: item.slot.instant,
        kind: 'missing' as const,
      })),
  ]);

  return aggregates.map(
    (aggregate): DayAggregateContentCalendarItem => ({
      filledCount: aggregate.filledCount,
      id: `day:${aggregate.dayKey}`,
      itemType: 'day-aggregate',
      missingCount: aggregate.missingCount,
      missingIdentityKeys: aggregate.missingIdentityKeys,
      scheduledDate: aggregate.instant,
      status: 'aggregate',
      title: translate('monthDaySummary', {
        filled: aggregate.filledCount,
        missing: aggregate.missingCount,
      }),
    }),
  );
}
