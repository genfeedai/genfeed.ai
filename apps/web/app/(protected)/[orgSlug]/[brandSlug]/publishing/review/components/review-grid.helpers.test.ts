import { TurboRunItemStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import {
  getVisibleReviewItems,
  parseReviewFilters,
  searchReviewItems,
  serializeReviewFilters,
} from './review-grid.helpers';

describe('review multi-status filters', () => {
  it('parses comma-separated status filters and all', () => {
    expect(parseReviewFilters('ready')).toEqual(['ready']);
    expect(parseReviewFilters('ready,approved')).toEqual(['ready', 'approved']);
    expect(parseReviewFilters('all')).toEqual([]);
    expect(parseReviewFilters(null)).toBeNull();
  });

  it('serializes multi filters and empty as all', () => {
    expect(serializeReviewFilters(['ready'])).toBe('ready');
    expect(serializeReviewFilters(['ready', 'approved'])).toBe(
      'ready,approved',
    );
    expect(serializeReviewFilters([])).toBe('all');
  });

  it('unions multi-status selections', () => {
    const items = [
      { id: 'ready', status: TurboRunItemStatus.COMPLETED },
      {
        id: 'approved',
        reviewDecision: 'approved',
        status: TurboRunItemStatus.COMPLETED,
      },
      { id: 'failed', status: TurboRunItemStatus.FAILED },
    ];

    expect(
      getVisibleReviewItems(items as never, ['ready', 'failed']).map(
        (item) => item.id,
      ),
    ).toEqual(['ready', 'failed']);
    expect(
      getVisibleReviewItems(items as never, []).map((item) => item.id),
    ).toEqual(['ready', 'approved', 'failed']);
  });
});

describe('review search', () => {
  const items = [
    {
      assignee: { displayName: 'Dana Lee', handle: 'dana', id: 'u1' },
      caption: 'Spring launch teaser',
      id: 'a',
      platform: 'instagram',
    },
    { id: 'b', platform: 'twitter', targetAuthor: '@acme' },
    {
      id: 'c',
      prompt: 'Product demo walkthrough',
      sourceWorkflowName: 'Demo',
    },
  ] as never;

  it.each([
    ['spring', ['a']],
    ['TWITTER', ['b']],
    ['@acme', ['b']],
    ['dana', ['a']],
    ['demo', ['c']],
    ['zzz', []],
  ])('matches %s', (term, ids) => {
    expect(searchReviewItems(items, term).map((item) => item.id)).toEqual(ids);
  });

  it('returns every draft for a blank term', () => {
    expect(searchReviewItems(items, '   ')).toHaveLength(3);
  });
});
