import { ArticleStatus } from '@genfeedai/contracts';

export const CALENDAR_DEFAULT_EVENT_COLOR = '#8b5cf6';
export const CALENDAR_SLOT_EVENT_COLOR = '#64748b';

const ARTICLE_STATUS_COLORS: Record<string, string> = {
  [ArticleStatus.ARCHIVED]: '#ef4444',
  [ArticleStatus.DRAFT]: '#6b7280',
  [ArticleStatus.PUBLISHED]: '#10b981',
};

export type CalendarTagColorSource = {
  backgroundColor?: string | null;
  isDeleted?: boolean;
};

export type ContentCalendarColorItem = {
  article?: { tags?: readonly CalendarTagColorSource[] | null };
  itemType: 'article' | 'release' | 'slot';
  release?: { firstTagColor?: string | null };
  status: string;
};

export function firstTagBackgroundColor(
  tags: readonly CalendarTagColorSource[] | null | undefined,
): string | undefined {
  if (!tags) {
    return undefined;
  }

  const firstTag = tags.find((tag) => tag.isDeleted !== true);
  const color = firstTag?.backgroundColor?.trim();
  return color ? color : undefined;
}

export function getArticleStatusColor(status: string): string {
  return ARTICLE_STATUS_COLORS[status] ?? CALENDAR_DEFAULT_EVENT_COLOR;
}

/** Filled tagged items use first-tag color; slots stay the untagged slate. */
export function getContentCalendarEventColor(
  item: ContentCalendarColorItem,
): string {
  if (item.itemType === 'slot') {
    return CALENDAR_SLOT_EVENT_COLOR;
  }

  const tagColor =
    item.itemType === 'article'
      ? firstTagBackgroundColor(item.article?.tags)
      : item.release?.firstTagColor?.trim();

  if (tagColor) {
    return tagColor;
  }

  if (item.itemType === 'article') {
    return getArticleStatusColor(item.status);
  }

  return CALENDAR_DEFAULT_EVENT_COLOR;
}
