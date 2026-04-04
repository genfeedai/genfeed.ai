import { describe, expect, it } from 'vitest';
import { VideoResolution } from '../src/video-resolution.enum';

describe('video-resolution.enum', () => {
  describe('VideoResolution', () => {
    it('should have 4 members', () => {
      expect(Object.values(VideoResolution)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(VideoResolution._480P).toBe('480p');
      expect(VideoResolution._720P).toBe('720p');
      expect(VideoResolution._1080P).toBe('1080p');
      expect(VideoResolution._4K).toBe('4k');
    });
  });
});
