import type { InboxItem } from '@/props/messages/replies-page.props';

/** Keeps the comments whose author, text or parent post contain the term. */
export function filterInboxItems(
  items: InboxItem[],
  search: string,
): InboxItem[] {
  const term = search.trim().toLowerCase();
  if (!term) {
    return items;
  }

  return items.filter((item) =>
    [
      item.authorUsername,
      item.authorDisplayName,
      item.commentText,
      item.parentPostPreview,
    ].some((field) => field?.toLowerCase().includes(term)),
  );
}
