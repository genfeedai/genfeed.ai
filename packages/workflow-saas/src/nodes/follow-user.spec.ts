import { describe, expect, it } from 'vitest';
import { DEFAULT_FOLLOW_USER_DATA } from './follow-user';

describe('follow-user node', () => {
  describe('DEFAULT_FOLLOW_USER_DATA', () => {
    it('should have label set to Follow User', () => {
      expect(DEFAULT_FOLLOW_USER_DATA.label).toBe('Follow User');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_FOLLOW_USER_DATA.status).toBe('idle');
    });

    it('should have type set to followUser', () => {
      expect(DEFAULT_FOLLOW_USER_DATA.type).toBe('followUser');
    });

    it('should default platform to twitter', () => {
      expect(DEFAULT_FOLLOW_USER_DATA.platform).toBe('twitter');
    });

    it('should default userId to empty string', () => {
      expect(DEFAULT_FOLLOW_USER_DATA.userId).toBe('');
    });

    it('should default accountId to empty string', () => {
      expect(DEFAULT_FOLLOW_USER_DATA.accountId).toBe('');
    });
  });
});
