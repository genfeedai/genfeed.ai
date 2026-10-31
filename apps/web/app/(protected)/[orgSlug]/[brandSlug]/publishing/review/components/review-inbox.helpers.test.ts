import { describe, expect, it } from 'vitest';
import {
  getReviewInboxItemPage,
  getReviewInboxPageCount,
  isReviewInboxVideoUrl,
  paginateReviewInboxItems,
  REVIEW_INBOX_PAGE_SIZE,
} from './review-inbox.helpers';

const items = Array.from(
  { length: REVIEW_INBOX_PAGE_SIZE * 2 + 1 },
  (_, i) => ({
    id: `item-${i + 1}`,
  }),
);

describe('review inbox pagination', () => {
  it('counts at least one page, even when empty', () => {
    expect(getReviewInboxPageCount(0)).toBe(1);
    expect(getReviewInboxPageCount(REVIEW_INBOX_PAGE_SIZE)).toBe(1);
    expect(getReviewInboxPageCount(REVIEW_INBOX_PAGE_SIZE + 1)).toBe(2);
  });

  it('slices one page and clamps an out-of-range page', () => {
    expect(paginateReviewInboxItems(items, 1)).toHaveLength(
      REVIEW_INBOX_PAGE_SIZE,
    );
    expect(paginateReviewInboxItems(items, 3)).toEqual([items[20]]);
    expect(paginateReviewInboxItems(items, 99)).toEqual([items[20]]);
    expect(paginateReviewInboxItems(items, 0)).toEqual(items.slice(0, 10));
  });

  it('finds the page holding an item', () => {
    expect(getReviewInboxItemPage(items, 'item-1')).toBe(1);
    expect(getReviewInboxItemPage(items, 'item-10')).toBe(1);
    expect(getReviewInboxItemPage(items, 'item-11')).toBe(2);
    expect(getReviewInboxItemPage(items, 'item-21')).toBe(3);
    expect(getReviewInboxItemPage(items, 'missing')).toBeNull();
    expect(getReviewInboxItemPage(items, null)).toBeNull();
  });
});

describe('isReviewInboxVideoUrl', () => {
  it('recognises video files, with or without a query', () => {
    expect(isReviewInboxVideoUrl('https://cdn.example.com/a.mp4')).toBe(true);
    expect(isReviewInboxVideoUrl('https://cdn.example.com/a.WEBM?x=1')).toBe(
      true,
    );
    expect(isReviewInboxVideoUrl('https://cdn.example.com/a.jpg')).toBe(false);
  });
});
