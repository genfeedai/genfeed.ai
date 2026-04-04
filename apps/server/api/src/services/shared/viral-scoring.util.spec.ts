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
});
