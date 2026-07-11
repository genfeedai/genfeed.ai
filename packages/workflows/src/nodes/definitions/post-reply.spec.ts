import { describe, expect, it } from 'vitest';
import { DEFAULT_POST_REPLY_DATA } from './post-reply';

describe('post-reply node', () => {
  describe('DEFAULT_POST_REPLY_DATA', () => {
    it('should have label set to Post Reply', () => {
      expect(DEFAULT_POST_REPLY_DATA.label).toBe('Post Reply');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_POST_REPLY_DATA.status).toBe('idle');
    });

    it('should have type set to postReply', () => {
      expect(DEFAULT_POST_REPLY_DATA.type).toBe('postReply');
    });

    it('should default platform to twitter', () => {
      expect(DEFAULT_POST_REPLY_DATA.platform).toBe('twitter');
    });

    it('should default postId and text to empty string', () => {
      expect(DEFAULT_POST_REPLY_DATA.postId).toBe('');
      expect(DEFAULT_POST_REPLY_DATA.text).toBe('');
    });

    it('should default mediaUrl to empty string', () => {
      expect(DEFAULT_POST_REPLY_DATA.mediaUrl).toBe('');
    });

    it('should default output fields to null', () => {
      expect(DEFAULT_POST_REPLY_DATA.replyId).toBeNull();
      expect(DEFAULT_POST_REPLY_DATA.replyUrl).toBeNull();
    });
  });
});
