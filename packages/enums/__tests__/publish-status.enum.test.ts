import { describe, expect, it } from 'vitest';
import { PublishStatus } from '../src/publish-status.enum';

describe('publish-status.enum', () => {
  describe('PublishStatus', () => {
    it('should have 5 members', () => {
      expect(Object.values(PublishStatus)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(PublishStatus.SCHEDULED).toBe('scheduled');
      expect(PublishStatus.PUBLISHING).toBe('publishing');
      expect(PublishStatus.PUBLISHED).toBe('published');
      expect(PublishStatus.FAILED).toBe('failed');
      expect(PublishStatus.CANCELLED).toBe('cancelled');
    });
  });
});
