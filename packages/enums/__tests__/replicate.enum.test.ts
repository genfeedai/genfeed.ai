import { describe, expect, it } from 'vitest';
import { ReplicatePredictionStatus } from '../src/replicate.enum';

describe('replicate.enum', () => {
  describe('ReplicatePredictionStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(ReplicatePredictionStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(ReplicatePredictionStatus.COMPLETED).toBe('completed');
      expect(ReplicatePredictionStatus.FAILED).toBe('failed');
      expect(ReplicatePredictionStatus.ERROR).toBe('error');
      expect(ReplicatePredictionStatus.PROCESSING).toBe('processing');
    });
  });
});
