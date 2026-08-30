import { ViralScoringUtil } from '@api/services/shared/viral-scoring.util';

describe('ViralScoringUtil', () => {
  describe('calculateViralityScore', () => {
    it('should return 0 for zero views and engagement', () => {
      const score = ViralScoringUtil.calculateViralityScore(0, 0);
      expect(score).toBe(0);
    });

    it('should return higher score for more views', () => {
      const low = ViralScoringUtil.calculateViralityScore(100, 10);
      const high = ViralScoringUtil.calculateViralityScore(1000000, 10);
      expect(high).toBeGreaterThan(low);
    });

    it('should return higher score for more engagement', () => {
      const low = ViralScoringUtil.calculateViralityScore(1000, 10);
      const high = ViralScoringUtil.calculateViralityScore(1000, 100000);
      expect(high).toBeGreaterThan(low);
    });

    it('should cap at 100', () => {
      const score = ViralScoringUtil.calculateViralityScore(
        999999999,
        999999999,
      );
      expect(score).toBeLessThanOrEqual(100);
    });

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

    it('never lowers a score when engagement increases', () => {
      const noEngagement = ViralScoringUtil.calculateViralityScore(400_000, 0);
      const withEngagement = ViralScoringUtil.calculateViralityScore(
        400_000,
        3,
      );

      expect(withEngagement).toBeGreaterThanOrEqual(noEngagement);
    });
  });

  describe('calculateViralScore', () => {
    it('should return 0 for zero inputs', () => {
      const score = ViralScoringUtil.calculateViralScore(0, 0, 0);
      expect(score).toBe(0);
    });

    it('should factor in velocity', () => {
      const noVelocity = ViralScoringUtil.calculateViralScore(1000, 5, 0);
      const highVelocity = ViralScoringUtil.calculateViralScore(
        1000,
        5,
        100000,
      );
      expect(highVelocity).toBeGreaterThan(noVelocity);
    });

    it('should cap at 100', () => {
      const score = ViralScoringUtil.calculateViralScore(
        999999999,
        100,
        999999999,
      );
      expect(score).toBeLessThanOrEqual(100);
    });

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
    it('calculates engagement and hourly velocity', () => {
      expect(
        ViralScoringUtil.calculateVideoMetrics({
          commentCount: 5,
          hoursAgo: 2,
          likeCount: 10,
          shareCount: 5,
          viewCount: 100,
        }),
      ).toMatchObject({
        engagementRate: 20,
        velocity: 50,
      });
    });

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

    it('uses the default 24-hour window', () => {
      expect(
        ViralScoringUtil.calculateVideoMetrics({
          commentCount: 0,
          likeCount: 0,
          shareCount: 0,
          viewCount: 48,
        }).velocity,
      ).toBe(2);
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
