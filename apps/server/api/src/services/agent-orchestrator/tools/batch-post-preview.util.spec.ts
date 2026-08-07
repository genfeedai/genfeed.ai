import { describe, expect, it } from 'vitest';
import {
  BATCH_POST_PREVIEW_LIMIT,
  type BatchStreamedItem,
  takeBatchPostPreviews,
} from './batch-post-preview.util';

function completed(
  index: number,
  overrides: Partial<BatchStreamedItem> = {},
): BatchStreamedItem {
  return {
    index,
    platform: 'twitter',
    postId: `post-${index + 1}`,
    previewText: `Draft ${index + 1}`,
    status: 'completed',
    topic: `topic-${index + 1}`,
    ...overrides,
  };
}

describe('takeBatchPostPreviews', () => {
  it('takes only up to the requested limit and reports remaining', () => {
    const items: BatchStreamedItem[] = [
      completed(0),
      completed(1),
      completed(2),
      completed(3),
      completed(4),
      { index: 5, status: 'failed', topic: 'nope', error: 'x' },
    ];

    const result = takeBatchPostPreviews(items, {
      limit: BATCH_POST_PREVIEW_LIMIT,
    });

    expect(result.completedCount).toBe(5);
    expect(result.previews).toHaveLength(BATCH_POST_PREVIEW_LIMIT);
    expect(result.previews.map((p) => p.id)).toEqual([
      'post-1',
      'post-2',
      'post-3',
    ]);
    expect(result.remainingCount).toBe(2);
  });

  it('returns empty previews when limit is 0', () => {
    const result = takeBatchPostPreviews([completed(0), completed(1)], {
      limit: 0,
    });

    expect(result.previews).toEqual([]);
    expect(result.completedCount).toBe(2);
    expect(result.remainingCount).toBe(2);
  });

  it('skips completed rows without postId', () => {
    const result = takeBatchPostPreviews(
      [completed(0, { postId: undefined }), completed(1)],
      { limit: 3 },
    );

    expect(result.completedCount).toBe(1);
    expect(result.previews).toHaveLength(1);
    expect(result.previews[0]?.id).toBe('post-2');
    expect(result.remainingCount).toBe(0);
  });
});
