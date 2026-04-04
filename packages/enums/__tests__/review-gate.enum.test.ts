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
    it('should have 3 members', () => {
      expect(Object.values(NotificationChannel)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(NotificationChannel.EMAIL).toBe('email');
      expect(NotificationChannel.WEBHOOK).toBe('webhook');
      expect(NotificationChannel.SLACK).toBe('slack');
    });
  });
});
