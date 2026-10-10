import { describe, expect, it } from 'vitest';
import {
  TURBO_RUN_POST_PREVIEW_LIMIT,
  type TurboRunStreamedItem,
  takeTurboRunPostPreviews,
} from './turbo-run-post-preview.util';

function completed(
  index: number,
  overrides: Partial<TurboRunStreamedItem> = {},
): TurboRunStreamedItem {
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

describe('takeTurboRunPostPreviews', () => {
  it('takes only up to the requested limit and reports remaining', () => {
    const items: TurboRunStreamedItem[] = [
      completed(0),
      completed(1),
      completed(2),
      completed(3),
      completed(4),
      { index: 5, status: 'failed', topic: 'nope', error: 'x' },
    ];

    const result = takeTurboRunPostPreviews(items, {
      limit: TURBO_RUN_POST_PREVIEW_LIMIT,
    });

    expect(result.completedCount).toBe(5);
    expect(result.previews).toHaveLength(TURBO_RUN_POST_PREVIEW_LIMIT);
    expect(result.previews.map((p) => p.id)).toEqual([
      'post-1',
      'post-2',
      'post-3',
    ]);
    expect(result.remainingCount).toBe(2);
  });

  it('returns empty previews when limit is 0', () => {
    const result = takeTurboRunPostPreviews([completed(0), completed(1)], {
      limit: 0,
    });

    expect(result.previews).toEqual([]);
    expect(result.completedCount).toBe(2);
    expect(result.remainingCount).toBe(2);
  });

  it('skips completed rows without postId', () => {
    const result = takeTurboRunPostPreviews(
      [completed(0, { postId: undefined }), completed(1)],
      { limit: 3 },
    );

    expect(result.completedCount).toBe(1);
    expect(result.previews).toHaveLength(1);
    expect(result.previews[0]?.id).toBe('post-2');
    expect(result.remainingCount).toBe(0);
  });
});
