import { describe, expect, it } from 'vitest';
import {
  getReviewInboxItemPage,
  getReviewInboxPageCount,
  isReviewInboxVideoUrl,
  paginateReviewInboxItems,
  REVIEW_INBOX_PAGE_SIZE,
  searchReviewInboxItems,
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

describe('review inbox search', () => {
  const requests = [
    {
      actionSummary: 'Publish the spring launch reel',
      brandLabel: 'Acme',
      id: 'workflow:1',
      sourceLabel: 'Launch workflow',
      toolName: null,
    },
    {
      actionSummary: 'Send a reply',
      brandLabel: null,
      id: 'mcp_approval:2',
      sourceLabel: 'create_post',
      toolName: 'create_post',
    },
  ] as never;

  it('matches the action, source, brand or tool, ignoring case', () => {
    expect(
      searchReviewInboxItems(requests, 'SPRING').map((item) => item.id),
    ).toEqual(['workflow:1']);
    expect(
      searchReviewInboxItems(requests, 'acme').map((item) => item.id),
    ).toEqual(['workflow:1']);
    expect(
      searchReviewInboxItems(requests, 'create_post').map((item) => item.id),
    ).toEqual(['mcp_approval:2']);
  });

  it('returns every request for a blank term and none for a miss', () => {
    expect(searchReviewInboxItems(requests, '  ')).toHaveLength(2);
    expect(searchReviewInboxItems(requests, 'nothing like this')).toEqual([]);
  });
});
