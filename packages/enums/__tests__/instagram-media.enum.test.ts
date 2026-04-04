import { describe, expect, it } from 'vitest';
import {
  InstagramMediaStatus,
  InstagramMediaType,
} from '../src/instagram-media.enum';

describe('instagram-media.enum', () => {
  describe('InstagramMediaStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(InstagramMediaStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(InstagramMediaStatus.EXPIRED).toBe('EXPIRED');
      expect(InstagramMediaStatus.ERROR).toBe('ERROR');
      expect(InstagramMediaStatus.FINISHED).toBe('FINISHED');
      expect(InstagramMediaStatus.IN_PROGRESS).toBe('IN_PROGRESS');
    });
  });

  describe('InstagramMediaType', () => {
    it('should have 5 members', () => {
      expect(Object.values(InstagramMediaType)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(InstagramMediaType.IMAGE).toBe('IMAGE');
      expect(InstagramMediaType.VIDEO).toBe('VIDEO');
      expect(InstagramMediaType.CAROUSEL_ALBUM).toBe('CAROUSEL_ALBUM');
      expect(InstagramMediaType.REELS).toBe('REELS');
      expect(InstagramMediaType.CAROUSEL).toBe('CAROUSEL');
    });
  });
});
