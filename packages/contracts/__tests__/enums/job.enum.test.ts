import { describe, expect, it } from 'vitest';
import { JobState } from '../../src/enums/job.enum';

describe('job.enum', () => {
  describe('JobState', () => {
    it('should have correct values', () => {
      expect(JobState.PENDING).toBe('pending');
      expect(JobState.ACTIVE).toBe('active');
      expect(JobState.COMPLETED).toBe('completed');
      expect(JobState.FAILED).toBe('failed');
      expect(JobState.DELAYED).toBe('delayed');
    });
  });
});
