import { describe, expect, it } from 'vitest';
import { BookmarkIntent } from '../../src/enums/bookmark.enum';

describe('bookmark.enum', () => {
  describe('BookmarkIntent', () => {
    it('should have 5 members', () => {
      expect(Object.values(BookmarkIntent)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(BookmarkIntent.VIDEO).toBe('VIDEO');
      expect(BookmarkIntent.IMAGE).toBe('IMAGE');
      expect(BookmarkIntent.REPLY).toBe('REPLY');
      expect(BookmarkIntent.REFERENCE).toBe('REFERENCE');
      expect(BookmarkIntent.INSPIRATION).toBe('INSPIRATION');
    });
  });
});
