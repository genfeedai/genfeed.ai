import { describe, expect, it } from 'vitest';
import { MediaCategory } from '../src/social-media.enum';

describe('social-media.enum', () => {
  describe('MediaCategory', () => {
    it('should have 6 members', () => {
      expect(Object.values(MediaCategory)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(MediaCategory.TEXT).toBe('text');
      expect(MediaCategory.IMAGE).toBe('image');
      expect(MediaCategory.VIDEO).toBe('video');
      expect(MediaCategory.REEL).toBe('reel');
      expect(MediaCategory.CAROUSEL).toBe('carousel');
      expect(MediaCategory.STORY).toBe('story');
    });
  });
});
