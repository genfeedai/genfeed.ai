import {
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  MetadataExtension,
} from '@genfeedai/enums';

export interface ActivityRouting {
  activityKey: ActivityKey;
  processingKey: ActivityKey;
  activitySource: ActivitySource;
}

export interface ActivityRoutingInput {
  category: IngredientCategory | string;
  isReframe?: boolean;
  isUpscale?: boolean;
  metadataExtension?: MetadataExtension | string;
}

/**
 * Determines ActivityKey, processingKey, and ActivitySource from category + transformations.
 * Replaces duplicated inline routing logic in webhooks.service.ts.
 */
export function getActivityRouting(
  input: ActivityRoutingInput,
): ActivityRouting | null {
  const { category, isReframe, isUpscale, metadataExtension } = input;
  const categoryStr = String(category);

  const isVideo =
    categoryStr === String(IngredientCategory.VIDEO) ||
    (categoryStr === 'avatar-video' &&
      metadataExtension === MetadataExtension.MP4);

  if (isVideo) {
    if (isReframe) {
      return {
        activityKey: ActivityKey.VIDEO_REFRAME_COMPLETED,
        activitySource: ActivitySource.VIDEO_REFRAME,
        processingKey: ActivityKey.VIDEO_REFRAME_PROCESSING,
      };
    }
    if (isUpscale) {
      return {
        activityKey: ActivityKey.VIDEO_UPSCALE_COMPLETED,
        activitySource: ActivitySource.VIDEO_UPSCALE,
        processingKey: ActivityKey.VIDEO_UPSCALE_PROCESSING,
      };
    }
    return {
      activityKey: ActivityKey.VIDEO_GENERATED,
      activitySource: ActivitySource.VIDEO_GENERATION,
      processingKey: ActivityKey.VIDEO_PROCESSING,
    };
  }

  if (categoryStr === String(IngredientCategory.IMAGE)) {
    if (isReframe) {
      return {
        activityKey: ActivityKey.IMAGE_REFRAME_COMPLETED,
        activitySource: ActivitySource.IMAGE_REFRAME,
        processingKey: ActivityKey.IMAGE_REFRAME_PROCESSING,
      };
    }
    if (isUpscale) {
      return {
        activityKey: ActivityKey.IMAGE_UPSCALE_COMPLETED,
        activitySource: ActivitySource.IMAGE_UPSCALE,
        processingKey: ActivityKey.IMAGE_UPSCALE_PROCESSING,
      };
    }
    return {
      activityKey: ActivityKey.IMAGE_GENERATED,
      activitySource: ActivitySource.IMAGE_GENERATION,
      processingKey: ActivityKey.IMAGE_PROCESSING,
    };
  }

  if (categoryStr === String(IngredientCategory.MUSIC)) {
    return {
      activityKey: ActivityKey.MUSIC_GENERATED,
      activitySource: ActivitySource.MUSIC_GENERATION,
      processingKey: ActivityKey.MUSIC_PROCESSING,
    };
  }

  return null;
}

/**
 * Determines failure ActivityKey, processingKey, and ActivitySource from category.
 * Replaces duplicated inline failure routing logic in webhooks.service.ts.
 */
export function getFailureActivityRouting(
  category: IngredientCategory | string,
): ActivityRouting | null {
  const categoryStr = String(category);

  if (categoryStr === String(IngredientCategory.VIDEO)) {
    return {
      activityKey: ActivityKey.VIDEO_FAILED,
      activitySource: ActivitySource.VIDEO_GENERATION,
      processingKey: ActivityKey.VIDEO_PROCESSING,
    };
  }

  if (categoryStr === String(IngredientCategory.IMAGE)) {
    return {
      activityKey: ActivityKey.IMAGE_FAILED,
      activitySource: ActivitySource.IMAGE_GENERATION,
      processingKey: ActivityKey.IMAGE_PROCESSING,
    };
  }

  if (categoryStr === String(IngredientCategory.MUSIC)) {
    return {
      activityKey: ActivityKey.MUSIC_FAILED,
      activitySource: ActivitySource.MUSIC_GENERATION,
      processingKey: ActivityKey.MUSIC_PROCESSING,
    };
  }

  return null;
}
