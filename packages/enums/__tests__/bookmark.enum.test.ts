import { describe, expect, it } from 'vitest';
import { BookmarkIntent } from '../src/bookmark.enum';

describe('bookmark.enum', () => {
  describe('BookmarkIntent', () => {
    it('should have 5 members', () => {
      expect(Object.values(BookmarkIntent)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(BookmarkIntent.VIDEO).toBe('video');
      expect(BookmarkIntent.IMAGE).toBe('image');
      expect(BookmarkIntent.REPLY).toBe('reply');
      expect(BookmarkIntent.REFERENCE).toBe('reference');
      expect(BookmarkIntent.INSPIRATION).toBe('inspiration');
    });
  });
});
