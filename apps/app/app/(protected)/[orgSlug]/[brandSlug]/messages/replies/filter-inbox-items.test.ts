import type { InboxItem } from '@props/messages/replies-page.props';
import { describe, expect, it } from 'vitest';
import { filterInboxItems } from './filter-inbox-items';

function item(overrides: Partial<InboxItem>): InboxItem {
  return {
    authorId: 'a1',
    authorUsername: 'someone',
    commentId: 'c1',
    commentText: 'hello',
    createdAt: '2026-10-31T08:00:00.000Z',
    intent: 'default',
    intentLabel: 'Default',
    parentPostId: 'p1',
    shouldSkipAuto: false,
    ...overrides,
  };
}

const items = [
  item({ authorUsername: 'maya', commentId: 'c1', commentText: 'Love this' }),
  item({
    authorDisplayName: 'Jordan Lee',
    authorUsername: 'jl',
    commentId: 'c2',
    commentText: 'How much is it?',
  }),
  item({
    commentId: 'c3',
    commentText: 'First!',
    parentPostPreview: 'Launch day recap',
  }),
];

describe('filterInboxItems', () => {
  it.each([
    ['', ['c1', 'c2', 'c3']],
    ['   ', ['c1', 'c2', 'c3']],
    ['MAYA', ['c1']],
    ['jordan', ['c2']],
    ['how much', ['c2']],
    ['launch', ['c3']],
    ['nothing matches', []],
  ])('for %j returns %j', (search, expectedIds) => {
    expect(filterInboxItems(items, search).map((i) => i.commentId)).toEqual(
      expectedIds,
    );
  });
});
