import { describe, expect, it } from 'vitest';
import { NotificationChannel, ReviewGateStatus } from '../src/review-gate.enum';

describe('review-gate.enum', () => {
  describe('ReviewGateStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(ReviewGateStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(ReviewGateStatus.PENDING).toBe('pending');
      expect(ReviewGateStatus.APPROVED).toBe('approved');
      expect(ReviewGateStatus.REJECTED).toBe('rejected');
      expect(ReviewGateStatus.TIMEOUT).toBe('timeout');
    });
  });

  describe('NotificationChannel', () => {
    it('should have the intended members', () => {
      expect(Object.entries(NotificationChannel)).toEqual([
        ['EMAIL', 'email'],
        ['WEBHOOK', 'webhook'],
        ['SLACK', 'slack'],
        ['TASK_INBOX', 'task-inbox'],
      ]);
    });
  });
});
