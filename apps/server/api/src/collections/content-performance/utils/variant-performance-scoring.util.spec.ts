import {
  computeVariantPerformanceScore,
  rankByScoreDesc,
} from '@api/collections/content-performance/utils/variant-performance-scoring.util';
import { describe, expect, it } from 'vitest';

describe('computeVariantPerformanceScore', () => {
  it('weights performance 0.6, engagement 0.3 (capped at 100), volume 0.1 (log10 views, capped at 30)', () => {
    const score = computeVariantPerformanceScore({
      avgEngagementRate: 5,
      avgPerformanceScore: 80,
      totalViews: 999,
    });

    // performance: 80 * 0.6 = 48
    // engagement: min(5 * 10, 100) * 0.3 = 50 * 0.3 = 15
    // volume: min(log10(1000) * 10, 30) * 0.1 = min(30, 30) * 0.1 = 3
    expect(score).toBeCloseTo(48 + 15 + 3, 5);
  });

  it('caps the engagement contribution at 100', () => {
    const score = computeVariantPerformanceScore({
      avgEngagementRate: 50, // 50 * 10 = 500, capped to 100
      avgPerformanceScore: 0,
      totalViews: 0,
    });

    expect(score).toBeCloseTo(100 * 0.3, 5);
  });

  it('caps the volume contribution at 30', () => {
    const score = computeVariantPerformanceScore({
      avgEngagementRate: 0,
      avgPerformanceScore: 0,
      totalViews: 10_000_000, // log10(10,000,001) * 10 ~= 70, capped to 30
    });

    expect(score).toBeCloseTo(30 * 0.1, 5);
  });

  it('treats zero views as a zero volume contribution', () => {
    const score = computeVariantPerformanceScore({
      avgEngagementRate: 0,
      avgPerformanceScore: 0,
      totalViews: 0,
    });

    expect(score).toBe(0);
  });
});

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

  it('does not mutate the input array', () => {
    const input = [
      { id: 'a', score: 1 },
      { id: 'b', score: 2 },
    ];
    const inputCopy = [...input];

    rankByScoreDesc(input);

    expect(input).toEqual(inputCopy);
  });

  it('returns an empty array for empty input', () => {
    expect(rankByScoreDesc([])).toEqual([]);
  });
});
