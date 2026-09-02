import { describe, expect, it } from 'vitest';
import { DEFAULT_COMMENT_TRIGGER_DATA } from './comment-trigger';

describe('commentTrigger node', () => {
  describe('DEFAULT_COMMENT_TRIGGER_DATA', () => {
    it('has expected defaults', () => {
      expect(DEFAULT_COMMENT_TRIGGER_DATA.label).toBe('Comment Trigger');
      expect(DEFAULT_COMMENT_TRIGGER_DATA.status).toBe('idle');
      expect(DEFAULT_COMMENT_TRIGGER_DATA.type).toBe('commentTrigger');
      expect(DEFAULT_COMMENT_TRIGGER_DATA.platform).toBe('youtube');
      expect(DEFAULT_COMMENT_TRIGGER_DATA.brandId).toBeNull();
      expect(DEFAULT_COMMENT_TRIGGER_DATA.contentIds).toEqual([]);
      expect(DEFAULT_COMMENT_TRIGGER_DATA.keywords).toEqual([]);
      expect(DEFAULT_COMMENT_TRIGGER_DATA.excludeKeywords).toEqual([]);
      expect(DEFAULT_COMMENT_TRIGGER_DATA.lastCommentId).toBeNull();
    });
  });
});
