import type {
  IReviewInboxItem,
  ReviewInboxItemSource,
} from '@genfeedai/contracts/interfaces';

export const REVIEW_INBOX_SOURCES: readonly ReviewInboxItemSource[] = [
  'agent',
  'workflow',
  'mcp_client',
];

/** `pages.publishing.review.inbox` keys naming each source. */
export const REVIEW_INBOX_SOURCE_MESSAGE_KEYS: Record<
  ReviewInboxItemSource,
  'sources.agent' | 'sources.workflow' | 'sources.mcpClient'
> = {
  agent: 'sources.agent',
  mcp_client: 'sources.mcpClient',
  workflow: 'sources.workflow',
};

/** Approval rows show a preview each, so a page stays short enough to scan. */
export const REVIEW_INBOX_PAGE_SIZE = 10;

const VIDEO_URL_PATTERN = /\.(?:mp4|mov|m4v|webm)(?:$|[?#])/i;

/** Whether a preview URL points at a video rather than an image. */
export function isReviewInboxVideoUrl(url: string): boolean {
  return VIDEO_URL_PATTERN.test(url);
}

export function getReviewInboxPageCount(itemCount: number): number {
  return Math.max(1, Math.ceil(itemCount / REVIEW_INBOX_PAGE_SIZE));
}

/** 1-based page holding the item, or null when it is not in the list. */
export function getReviewInboxItemPage(
  items: readonly { id: string }[],
  itemId: string | null,
): number | null {
  const index = itemId ? items.findIndex((item) => item.id === itemId) : -1;
  return index < 0 ? null : Math.floor(index / REVIEW_INBOX_PAGE_SIZE) + 1;
}

/** One 1-based page of rows; an out-of-range page is clamped. */
export function paginateReviewInboxItems<T>(
  items: readonly T[],
  page: number,
): T[] {
  const clampedPage = Math.min(
    Math.max(page, 1),
    getReviewInboxPageCount(items.length),
  );
  const start = (clampedPage - 1) * REVIEW_INBOX_PAGE_SIZE;
  return items.slice(start, start + REVIEW_INBOX_PAGE_SIZE);
}

/** Keeps the requests whose source, brand, action or tool contain the term. */
export function searchReviewInboxItems(
  items: readonly IReviewInboxItem[],
  search: string,
): IReviewInboxItem[] {
  const term = search.trim().toLowerCase();
  if (!term) {
    return [...items];
  }

  return items.filter((item) =>
    [item.sourceLabel, item.brandLabel, item.actionSummary, item.toolName].some(
      (field) => field?.toLowerCase().includes(term),
    ),
  );
}
