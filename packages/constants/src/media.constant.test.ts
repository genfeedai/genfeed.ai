import { IngredientFormat } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LABELS,
  VIDEO_DIMENSIONS,
  VIDEO_FORMAT_DIMENSIONS,
  VIDEO_MERGE_LIMITS,
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
    it('portrait is 1080x1920', () => {
      expect(VIDEO_FORMAT_DIMENSIONS[IngredientFormat.PORTRAIT]).toEqual({
        height: 1920,
        width: 1080,
      });
    });

    it('landscape is 1920x1080', () => {
      expect(VIDEO_FORMAT_DIMENSIONS[IngredientFormat.LANDSCAPE]).toEqual({
        height: 1080,
        width: 1920,
      });
    });

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

  describe('DEFAULT_LABELS', () => {
    it('has merged storyboard label', () => {
      expect(DEFAULT_LABELS.MERGED_STORYBOARD).toBe('Merged Storyboard');
    });
  });
});
