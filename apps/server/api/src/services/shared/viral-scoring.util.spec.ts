import { ViralScoringUtil } from '@api/services/shared/viral-scoring.util';

describe('ViralScoringUtil', () => {
  describe('calculateViralityScore', () => {
    it('keeps order-of-magnitude trend signals distinguishable', () => {
      const scores = [
        ViralScoringUtil.calculateViralityScore(100_000, 2_000),
        ViralScoringUtil.calculateViralityScore(1_000_000, 20_000),
        ViralScoringUtil.calculateViralityScore(10_000_000, 200_000),
        ViralScoringUtil.calculateViralityScore(50_000_000, 1_000_000),
      ];

      expect(scores).toEqual([55, 68, 82, 91]);
      expect(scores[1]).toBeLessThan(70);
      expect(scores[2]).toBeGreaterThanOrEqual(70);
    });
  });

  describe('calculateViralScore', () => {
    it('calibrates realistic video signals around the default threshold', () => {
      const scores = [
        ViralScoringUtil.calculateViralScore(100_000, 5, 1_000),
        ViralScoringUtil.calculateViralScore(1_000_000, 8, 10_000),
        ViralScoringUtil.calculateViralScore(10_000_000, 10, 50_000),
        ViralScoringUtil.calculateViralScore(50_000_000, 15, 250_000),
      ];

      expect(scores[0]).toBe(46);
      expect(scores[1]).toBe(60);
      expect(scores[2]).toBeGreaterThanOrEqual(70);
      expect(scores[2]).toBeLessThan(72);
      expect(scores[3]).toBe(83);
    });

    it('treats invalid or negative inputs as zero signal', () => {
      expect(
        ViralScoringUtil.calculateViralScore(
          Number.NaN,
          Number.POSITIVE_INFINITY,
          -1,
        ),
      ).toBe(0);
    });
  });

  describe('calculateVideoMetrics', () => {
    it('handles zero views and non-positive elapsed time', () => {
      expect(
        ViralScoringUtil.calculateVideoMetrics({
          commentCount: 0,
          hoursAgo: 0,
          likeCount: 0,
          shareCount: 0,
          viewCount: 0,
        }),
      ).toEqual({ engagementRate: 0, velocity: 0, viralScore: 0 });
      expect(
        ViralScoringUtil.calculateVideoMetrics({
          commentCount: 0,
          hoursAgo: -1,
          likeCount: 0,
          shareCount: 0,
          viewCount: 12,
        }).velocity,
      ).toBe(0);
    });
  });

  describe('calculateGrowthRate', () => {
    it('handles empty baselines and positive or negative growth', () => {
      expect(ViralScoringUtil.calculateGrowthRate(10, 0)).toBe(100);
      expect(ViralScoringUtil.calculateGrowthRate(0, 0)).toBe(0);
      expect(ViralScoringUtil.calculateGrowthRate(150, 100)).toBe(50);
      expect(ViralScoringUtil.calculateGrowthRate(50, 100)).toBe(-50);
    });
  });

  describe('calculateRankViralityScore', () => {
    it('uses the default rank count and caps out-of-range ranks', () => {
      expect(ViralScoringUtil.calculateRankViralityScore(1)).toBe(100);
      expect(ViralScoringUtil.calculateRankViralityScore(10, 10)).toBe(10);
      expect(ViralScoringUtil.calculateRankViralityScore(20, 10)).toBe(10);
    });

    it('clamps ranks below 1 to the top score', () => {
      expect(ViralScoringUtil.calculateRankViralityScore(0, 10)).toBe(100);
      expect(ViralScoringUtil.calculateRankViralityScore(-5, 10)).toBe(100);
    });
  });

  describe('normalizeScore', () => {
    it('rounds and clamps scores to the supported range', () => {
      expect(ViralScoringUtil.normalizeScore(-1)).toBe(0);
      expect(ViralScoringUtil.normalizeScore(42.6)).toBe(43);
      expect(ViralScoringUtil.normalizeScore(101)).toBe(100);
    });
  });
});
