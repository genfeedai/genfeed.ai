import { describe, expect, it } from 'vitest';
import { ReplicatePredictionStatus } from '../../src/enums/replicate.enum';

describe('replicate.enum', () => {
  describe('ReplicatePredictionStatus', () => {
    it('should have correct values', () => {
      expect(ReplicatePredictionStatus.COMPLETED).toBe('completed');
      expect(ReplicatePredictionStatus.FAILED).toBe('failed');
      expect(ReplicatePredictionStatus.ERROR).toBe('error');
      expect(ReplicatePredictionStatus.PROCESSING).toBe('processing');
    });
  });
});
