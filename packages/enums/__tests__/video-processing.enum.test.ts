import { describe, expect, it } from 'vitest';
import { VideoProcessingStatus } from '../src/video-processing.enum';

describe('video-processing.enum', () => {
  describe('VideoProcessingStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(VideoProcessingStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(VideoProcessingStatus.PENDING).toBe('pending');
      expect(VideoProcessingStatus.PROCESSING).toBe('processing');
      expect(VideoProcessingStatus.COMPLETED).toBe('completed');
      expect(VideoProcessingStatus.FAILED).toBe('failed');
    });
  });
});
