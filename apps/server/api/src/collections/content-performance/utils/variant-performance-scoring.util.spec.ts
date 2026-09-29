import { rankByScoreDesc } from '@api/collections/content-performance/utils/variant-performance-scoring.util';
import { describe, expect, it } from 'vitest';

describe('rankByScoreDesc', () => {
  it('sorts by score descending and assigns 1-based ranks', () => {
    const ranked = rankByScoreDesc([
      { id: 'a', score: 10 },
      { id: 'b', score: 90 },
      { id: 'c', score: 50 },
    ]);

    expect(ranked.map((item) => item.id)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 3]);
  });
});
