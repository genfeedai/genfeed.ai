import { BatchItemStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

import {
  getVisibleReviewItems,
  parseReviewFilters,
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
      { id: 'ready', status: BatchItemStatus.COMPLETED },
      {
        id: 'approved',
        reviewDecision: 'approved',
        status: BatchItemStatus.COMPLETED,
      },
      { id: 'failed', status: BatchItemStatus.FAILED },
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
