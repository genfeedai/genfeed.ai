import { describe, expect, it } from 'vitest';
import { DEFAULT_LIKE_POST_DATA } from './like-post';

describe('like-post node', () => {
  describe('DEFAULT_LIKE_POST_DATA', () => {
    it('should have label set to Like Post', () => {
      expect(DEFAULT_LIKE_POST_DATA.label).toBe('Like Post');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_LIKE_POST_DATA.status).toBe('idle');
    });

    it('should have type set to likePost', () => {
      expect(DEFAULT_LIKE_POST_DATA.type).toBe('likePost');
    });

    it('should default platform to twitter', () => {
      expect(DEFAULT_LIKE_POST_DATA.platform).toBe('twitter');
    });

    it('should default postId to empty string', () => {
      expect(DEFAULT_LIKE_POST_DATA.postId).toBe('');
    });

    it('should default accountId to empty string', () => {
      expect(DEFAULT_LIKE_POST_DATA.accountId).toBe('');
    });
  });
});
