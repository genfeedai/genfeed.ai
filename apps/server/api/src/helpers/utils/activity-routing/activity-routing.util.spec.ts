import {
  getActivityRouting,
  getFailureActivityRouting,
} from '@api/helpers/utils/activity-routing/activity-routing.util';
import {
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  MetadataExtension,
} from '@genfeedai/enums';

describe('ActivityRoutingUtil', () => {
  describe('getActivityRouting', () => {
    it('should return video generation routing for VIDEO category', () => {
      const result = getActivityRouting({
        category: IngredientCategory.VIDEO,
      });

      expect(result).toEqual({
        activityKey: ActivityKey.VIDEO_GENERATED,
        activitySource: ActivitySource.VIDEO_GENERATION,
        processingKey: ActivityKey.VIDEO_PROCESSING,
      });
    });

    it('should return video reframe routing when isReframe is true', () => {
      const result = getActivityRouting({
        category: IngredientCategory.VIDEO,
        isReframe: true,
      });

      expect(result).toEqual({
        activityKey: ActivityKey.VIDEO_REFRAME_COMPLETED,
        activitySource: ActivitySource.VIDEO_REFRAME,
        processingKey: ActivityKey.VIDEO_REFRAME_PROCESSING,
      });
    });

    it('should return video upscale routing when isUpscale is true', () => {
      const result = getActivityRouting({
        category: IngredientCategory.VIDEO,
        isUpscale: true,
      });

      expect(result).toEqual({
        activityKey: ActivityKey.VIDEO_UPSCALE_COMPLETED,
        activitySource: ActivitySource.VIDEO_UPSCALE,
        processingKey: ActivityKey.VIDEO_UPSCALE_PROCESSING,
      });
    });

    it('should prioritize reframe over upscale for VIDEO', () => {
      const result = getActivityRouting({
        category: IngredientCategory.VIDEO,
        isReframe: true,
        isUpscale: true,
      });

      expect(result?.activityKey).toBe(ActivityKey.VIDEO_REFRAME_COMPLETED);
    });

    it('should return image generation routing for IMAGE category', () => {
      const result = getActivityRouting({
        category: IngredientCategory.IMAGE,
      });

      expect(result).toEqual({
        activityKey: ActivityKey.IMAGE_GENERATED,
        activitySource: ActivitySource.IMAGE_GENERATION,
        processingKey: ActivityKey.IMAGE_PROCESSING,
      });
    });

    it('should return image reframe routing when isReframe is true', () => {
      const result = getActivityRouting({
        category: IngredientCategory.IMAGE,
        isReframe: true,
      });

      expect(result).toEqual({
        activityKey: ActivityKey.IMAGE_REFRAME_COMPLETED,
        activitySource: ActivitySource.IMAGE_REFRAME,
        processingKey: ActivityKey.IMAGE_REFRAME_PROCESSING,
      });
    });

    it('should return image upscale routing when isUpscale is true', () => {
      const result = getActivityRouting({
        category: IngredientCategory.IMAGE,
        isUpscale: true,
      });

      expect(result).toEqual({
        activityKey: ActivityKey.IMAGE_UPSCALE_COMPLETED,
        activitySource: ActivitySource.IMAGE_UPSCALE,
        processingKey: ActivityKey.IMAGE_UPSCALE_PROCESSING,
      });
    });

    it('should return music generation routing for MUSIC category', () => {
      const result = getActivityRouting({
        category: IngredientCategory.MUSIC,
      });

      expect(result).toEqual({
        activityKey: ActivityKey.MUSIC_GENERATED,
        activitySource: ActivitySource.MUSIC_GENERATION,
        processingKey: ActivityKey.MUSIC_PROCESSING,
      });
    });

    it('should return video routing for avatar-video with MP4 extension', () => {
      const result = getActivityRouting({
        category: 'avatar-video',
        metadataExtension: MetadataExtension.MP4,
      });

      expect(result?.activityKey).toBe(ActivityKey.VIDEO_GENERATED);
    });

    it('should return null for unsupported category', () => {
      const result = getActivityRouting({
        category: 'unknown-category',
      });

      expect(result).toBeNull();
    });

    it('should return null for avatar-video without MP4 extension', () => {
      const result = getActivityRouting({
        category: 'avatar-video',
        metadataExtension: 'jpg' as MetadataExtension,
      });

      expect(result).toBeNull();
    });

    it('should handle string category values', () => {
      const result = getActivityRouting({
        category: 'video',
      });

      expect(result?.activityKey).toBe(ActivityKey.VIDEO_GENERATED);
    });
  });

  describe('getFailureActivityRouting', () => {
    it('should return video failure routing', () => {
      const result = getFailureActivityRouting(IngredientCategory.VIDEO);

      expect(result).toEqual({
        activityKey: ActivityKey.VIDEO_FAILED,
        activitySource: ActivitySource.VIDEO_GENERATION,
        processingKey: ActivityKey.VIDEO_PROCESSING,
      });
    });

    it('should return image failure routing', () => {
      const result = getFailureActivityRouting(IngredientCategory.IMAGE);

      expect(result).toEqual({
        activityKey: ActivityKey.IMAGE_FAILED,
        activitySource: ActivitySource.IMAGE_GENERATION,
        processingKey: ActivityKey.IMAGE_PROCESSING,
      });
    });

    it('should return music failure routing', () => {
      const result = getFailureActivityRouting(IngredientCategory.MUSIC);

      expect(result).toEqual({
        activityKey: ActivityKey.MUSIC_FAILED,
        activitySource: ActivitySource.MUSIC_GENERATION,
        processingKey: ActivityKey.MUSIC_PROCESSING,
      });
    });

    it('should return null for unsupported category', () => {
      const result = getFailureActivityRouting('unknown-category');

      expect(result).toBeNull();
    });

    it('should handle string category values', () => {
      const result = getFailureActivityRouting('image');

      expect(result?.activityKey).toBe(ActivityKey.IMAGE_FAILED);
    });
  });
});
