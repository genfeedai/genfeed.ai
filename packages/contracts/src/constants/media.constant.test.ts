import { describe, expect, it } from 'vitest';
import { IngredientFormat } from '..';
import {
  CLIP_REFERENCE_FRAME_JOB_TIMEOUT_MS,
  CLIP_REFERENCE_FRAME_MAX_CANDIDATES,
  DEFAULT_LABELS,
  VIDEO_DIMENSIONS,
  VIDEO_FORMAT_DIMENSIONS,
  VIDEO_MERGE_LIMITS,
  VIDEO_STITCH_LIMITS,
  YT_DLP_PROCESS_TIMEOUT_MS,
} from './media.constant';

describe('media.constant', () => {
  describe('VIDEO_DIMENSIONS', () => {
    it('has correct min/max values', () => {
      expect(VIDEO_DIMENSIONS.MAX_WIDTH).toBe(1920);
      expect(VIDEO_DIMENSIONS.MAX_HEIGHT).toBe(1920);
      expect(VIDEO_DIMENSIONS.MIN_WIDTH).toBe(720);
      expect(VIDEO_DIMENSIONS.MIN_HEIGHT).toBe(720);
    });
  });

  describe('VIDEO_FORMAT_DIMENSIONS', () => {
    it('square is 1080x1080', () => {
      expect(VIDEO_FORMAT_DIMENSIONS[IngredientFormat.SQUARE]).toEqual({
        height: 1080,
        width: 1080,
      });
    });
  });

  describe('VIDEO_MERGE_LIMITS', () => {
    it('requires at least 2 and at most 10 videos', () => {
      expect(VIDEO_MERGE_LIMITS.MIN_VIDEOS).toBe(2);
      expect(VIDEO_MERGE_LIMITS.MAX_VIDEOS).toBe(10);
    });
  });

  describe('VIDEO_STITCH_LIMITS', () => {
    it('accepts the largest interpolation sequence without raising the merge UI limit', () => {
      expect(VIDEO_STITCH_LIMITS.MIN_CLIPS).toBe(VIDEO_MERGE_LIMITS.MIN_VIDEOS);
      expect(VIDEO_STITCH_LIMITS.MAX_CLIPS).toBe(51);
      expect(VIDEO_STITCH_LIMITS.MAX_CLIPS).toBeGreaterThan(
        VIDEO_MERGE_LIMITS.MAX_VIDEOS,
      );
    });
  });

  describe('clip reference frame limits', () => {
    it('keeps the job budget above the source download timeout', () => {
      expect(CLIP_REFERENCE_FRAME_MAX_CANDIDATES).toBe(5);
      expect(CLIP_REFERENCE_FRAME_JOB_TIMEOUT_MS).toBeGreaterThan(
        YT_DLP_PROCESS_TIMEOUT_MS,
      );
    });
  });

  describe('DEFAULT_LABELS', () => {
    it('has merged storyboard label', () => {
      expect(DEFAULT_LABELS.MERGED_STORYBOARD).toBe('Merged Storyboard');
    });
  });
});
