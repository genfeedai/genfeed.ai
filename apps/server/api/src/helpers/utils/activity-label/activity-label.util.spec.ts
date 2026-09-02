import {
  getActivityLabel,
  getActivityResultType,
} from '@api/helpers/utils/activity-label/activity-label.util';
import { ActivityKey } from '@genfeedai/enums';

describe('ActivityLabelUtil', () => {
  describe('getActivityLabel', () => {
    it('should return "Video Generation" for VIDEO_GENERATED', () => {
      expect(getActivityLabel(ActivityKey.VIDEO_GENERATED)).toBe(
        'Video Generation',
      );
    });

    it('should return "Video Reframe" for VIDEO_REFRAME_COMPLETED', () => {
      expect(getActivityLabel(ActivityKey.VIDEO_REFRAME_COMPLETED)).toBe(
        'Video Reframe',
      );
    });

    it('should return "Video Upscale" for VIDEO_UPSCALE_COMPLETED', () => {
      expect(getActivityLabel(ActivityKey.VIDEO_UPSCALE_COMPLETED)).toBe(
        'Video Upscale',
      );
    });

    it('should return "Image Generation" for IMAGE_GENERATED', () => {
      expect(getActivityLabel(ActivityKey.IMAGE_GENERATED)).toBe(
        'Image Generation',
      );
    });

    it('should return "Image Reframe" for IMAGE_REFRAME_COMPLETED', () => {
      expect(getActivityLabel(ActivityKey.IMAGE_REFRAME_COMPLETED)).toBe(
        'Image Reframe',
      );
    });

    it('should return "Image Upscale" for IMAGE_UPSCALE_COMPLETED', () => {
      expect(getActivityLabel(ActivityKey.IMAGE_UPSCALE_COMPLETED)).toBe(
        'Image Upscale',
      );
    });

    it('should return "Music Generation" for MUSIC_GENERATED', () => {
      expect(getActivityLabel(ActivityKey.MUSIC_GENERATED)).toBe(
        'Music Generation',
      );
    });

    it('should return "Video Generation" for VIDEO_FAILED', () => {
      expect(getActivityLabel(ActivityKey.VIDEO_FAILED)).toBe(
        'Video Generation',
      );
    });

    it('should return "Image Generation" for IMAGE_FAILED', () => {
      expect(getActivityLabel(ActivityKey.IMAGE_FAILED)).toBe(
        'Image Generation',
      );
    });

    it('should return "Music Generation" for MUSIC_FAILED', () => {
      expect(getActivityLabel(ActivityKey.MUSIC_FAILED)).toBe(
        'Music Generation',
      );
    });

    it('should return "Content Generation" for unmapped keys', () => {
      expect(getActivityLabel(ActivityKey.CREDITS_ADD)).toBe(
        'Content Generation',
      );
    });
  });

  describe('getActivityResultType', () => {
    it('should return "VIDEO" for video-related keys', () => {
      expect(getActivityResultType(ActivityKey.VIDEO_GENERATED)).toBe('VIDEO');
      expect(getActivityResultType(ActivityKey.VIDEO_REFRAME_COMPLETED)).toBe(
        'VIDEO',
      );
      expect(getActivityResultType(ActivityKey.VIDEO_UPSCALE_COMPLETED)).toBe(
        'VIDEO',
      );
      expect(getActivityResultType(ActivityKey.VIDEO_FAILED)).toBe('VIDEO');
    });

    it('should return "IMAGE" for image-related keys', () => {
      expect(getActivityResultType(ActivityKey.IMAGE_GENERATED)).toBe('IMAGE');
      expect(getActivityResultType(ActivityKey.IMAGE_REFRAME_COMPLETED)).toBe(
        'IMAGE',
      );
      expect(getActivityResultType(ActivityKey.IMAGE_UPSCALE_COMPLETED)).toBe(
        'IMAGE',
      );
      expect(getActivityResultType(ActivityKey.IMAGE_FAILED)).toBe('IMAGE');
    });

    it('should return "MUSIC" for music-related keys', () => {
      expect(getActivityResultType(ActivityKey.MUSIC_GENERATED)).toBe('MUSIC');
      expect(getActivityResultType(ActivityKey.MUSIC_FAILED)).toBe('MUSIC');
    });

    it('should return undefined for unmapped keys', () => {
      expect(getActivityResultType(ActivityKey.CREDITS_ADD)).toBeUndefined();
    });
  });
});
