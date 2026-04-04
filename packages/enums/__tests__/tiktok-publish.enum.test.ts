import { describe, expect, it } from 'vitest';
import { TikTokPublishStatus } from '../src/tiktok-publish.enum';

describe('tiktok-publish.enum', () => {
  describe('TikTokPublishStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(TikTokPublishStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(TikTokPublishStatus.PROCESSING_UPLOAD).toBe('PROCESSING_UPLOAD');
      expect(TikTokPublishStatus.PROCESSING_DOWNLOAD).toBe(
        'PROCESSING_DOWNLOAD',
      );
      expect(TikTokPublishStatus.PUBLISH_COMPLETE).toBe('PUBLISH_COMPLETE');
      expect(TikTokPublishStatus.FAILED).toBe('FAILED');
    });
  });
});
