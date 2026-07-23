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
      ).toBe(12);
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
  });

  describe('normalizeScore', () => {
    it('rounds and clamps scores to the supported range', () => {
      expect(ViralScoringUtil.normalizeScore(-1)).toBe(0);
      expect(ViralScoringUtil.normalizeScore(42.6)).toBe(43);
      expect(ViralScoringUtil.normalizeScore(101)).toBe(100);
    });
  });
});
