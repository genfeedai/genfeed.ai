import {
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  Platform,
} from '@genfeedai/enums';
import type { IActivity } from '@genfeedai/interfaces';

export const BACKGROUND_TASK_KEYS = [
  ActivityKey.VIDEO_PROCESSING,
  ActivityKey.VIDEO_GENERATED,
  ActivityKey.VIDEO_COMPLETED,
  ActivityKey.VIDEO_FAILED,
  ActivityKey.IMAGE_PROCESSING,
  ActivityKey.IMAGE_GENERATED,
  ActivityKey.IMAGE_FAILED,
  ActivityKey.MUSIC_PROCESSING,
  ActivityKey.MUSIC_GENERATED,
  ActivityKey.MUSIC_FAILED,
  ActivityKey.POST_GENERATED,
  ActivityKey.POST_CREATED,
  ActivityKey.POST_SCHEDULED,
  ActivityKey.POST_PUBLISHED,
  ActivityKey.POST_FAILED,
  ActivityKey.MODELS_TRAINING_CREATED,
  ActivityKey.MODELS_TRAINING_COMPLETED,
  ActivityKey.MODELS_TRAINING_FAILED,
  ActivityKey.ARTICLE_PROCESSING,
  ActivityKey.ARTICLE_GENERATED,
  ActivityKey.ARTICLE_FAILED,
];

const CREDIT_ACTIVITY_KEYS = [
  ActivityKey.CREDITS_ADD,
  ActivityKey.CREDITS_REMOVE,
  ActivityKey.CREDITS_REMOVE_ALL,
  ActivityKey.CREDITS_RESET,
];

export function isCreditActivity(key: string): boolean {
  return CREDIT_ACTIVITY_KEYS.includes(key as ActivityKey);
}

const ACTIVITY_SOURCE_LABELS: Record<string, string> = {
  [ActivitySource.BOT_GENERATION]: 'Agent conversation',
  [ActivitySource.IMAGE_GENERATION]: 'Image generation',
  [ActivitySource.VIDEO_GENERATION]: 'Video generation',
  [ActivitySource.MUSIC_GENERATION]: 'Music generation',
  [ActivitySource.ARTICLE_GENERATION]: 'Article generation',
  [ActivitySource.VOICE_GENERATION]: 'Voice generation',
  [ActivitySource.POST_GENERATION]: 'Post generation',
  [ActivitySource.PROMPT_ENHANCEMENT]: 'Prompt enhancement',
  [ActivitySource.PROMPT_REMIX]: 'Prompt remix',
  [ActivitySource.TWEET_REPLY]: 'Tweet reply',
  [ActivitySource.MODELS_TRAINING]: 'Model training',
  [ActivitySource.IMAGE_EVALUATION]: 'Image evaluation',
  [ActivitySource.VIDEO_EVALUATION]: 'Video evaluation',
  [ActivitySource.ARTICLE_EVALUATION]: 'Article evaluation',
  [ActivitySource.CONTENT_EVALUATION]: 'Content evaluation',
  [ActivitySource.VIDEO_REFRAME]: 'Video reframe',
  [ActivitySource.VIDEO_UPSCALE]: 'Video upscale',
  [ActivitySource.IMAGE_REFRAME]: 'Image reframe',
  [ActivitySource.IMAGE_UPSCALE]: 'Image upscale',
  [ActivitySource.PROMPT_CREATION]: 'Prompt creation',
  [ActivitySource.ARTICLE_ENHANCEMENT]: 'Article enhancement',
  [ActivitySource.ARTICLE_REMIX]: 'Article remix',
  [ActivitySource.POST_ENHANCEMENT]: 'Post enhancement',
  [ActivitySource.AVATAR_GENERATION]: 'Avatar generation',
  [ActivitySource.ASSET_GENERATION]: 'Asset generation',
  [ActivitySource.POST]: 'Content publish',
};

function getActivitySourceLabel(source: string): string | undefined {
  return ACTIVITY_SOURCE_LABELS[source];
}

export function parseActivityValue(
  value: string,
): Record<string, unknown> | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function isBackgroundTask(activity: IActivity): boolean {
  return BACKGROUND_TASK_KEYS.includes(activity.key as ActivityKey);
}

export function getBackgroundTaskStatus(
  key: string,
): 'processing' | 'completed' | 'failed' | 'pending' {
  switch (key) {
    case ActivityKey.VIDEO_COMPLETED:
    case ActivityKey.VIDEO_GENERATED:
    case ActivityKey.IMAGE_GENERATED:
    case ActivityKey.MUSIC_GENERATED:
    case ActivityKey.POST_PUBLISHED:
    case ActivityKey.POST_GENERATED:
    case ActivityKey.MODELS_TRAINING_COMPLETED:
    case ActivityKey.ARTICLE_GENERATED:
      return 'completed';
    case ActivityKey.VIDEO_FAILED:
    case ActivityKey.IMAGE_FAILED:
    case ActivityKey.MUSIC_FAILED:
    case ActivityKey.POST_FAILED:
    case ActivityKey.MODELS_TRAINING_FAILED:
    case ActivityKey.ARTICLE_FAILED:
      return 'failed';
    case ActivityKey.VIDEO_PROCESSING:
    case ActivityKey.IMAGE_PROCESSING:
    case ActivityKey.MUSIC_PROCESSING:
    case ActivityKey.POST_CREATED:
    case ActivityKey.POST_SCHEDULED:
    case ActivityKey.MODELS_TRAINING_CREATED:
    case ActivityKey.ARTICLE_PROCESSING:
      return 'processing';
    default:
      return 'pending';
  }
}

export function getResultTypeFromActivityKey(
  key: string,
): IngredientCategory | undefined {
  switch (key) {
    case ActivityKey.VIDEO_COMPLETED:
    case ActivityKey.VIDEO_GENERATED:
    case ActivityKey.VIDEO_PROCESSING:
    case ActivityKey.VIDEO_FAILED:
      return IngredientCategory.VIDEO;
    case ActivityKey.IMAGE_GENERATED:
    case ActivityKey.IMAGE_PROCESSING:
    case ActivityKey.IMAGE_FAILED:
      return IngredientCategory.IMAGE;
    case ActivityKey.MUSIC_GENERATED:
    case ActivityKey.MUSIC_PROCESSING:
    case ActivityKey.MUSIC_FAILED:
      return IngredientCategory.MUSIC;
    default:
      return undefined;
  }
}

export function getActivityDescription(activity: IActivity): string {
  const key = activity.key as ActivityKey;

  switch (key) {
    // Image
    case ActivityKey.IMAGE_PROCESSING:
      return 'Generating an image...';
    case ActivityKey.IMAGE_GENERATED:
      return 'Generated an image';
    case ActivityKey.IMAGE_FAILED:
      return 'Failed to generate image';

    // Video
    case ActivityKey.VIDEO_PROCESSING:
      return 'Generating a video...';
    case ActivityKey.VIDEO_GENERATED:
    case ActivityKey.VIDEO_COMPLETED:
      return 'Generated a video';
    case ActivityKey.VIDEO_FAILED:
      return 'Failed to generate video';
    case ActivityKey.VIDEO_SCHEDULED:
      return 'Scheduled a video';

    // Music
    case ActivityKey.MUSIC_PROCESSING:
      return 'Generating music...';
    case ActivityKey.MUSIC_GENERATED:
      return 'Generated music';
    case ActivityKey.MUSIC_FAILED:
      return 'Failed to generate music';

    // Posts
    case ActivityKey.POST_GENERATED: {
      const parsed = parseActivityValue(activity.value);
      return (
        (parsed?.description as string) ||
        (parsed?.label as string) ||
        'Content is ready for review'
      );
    }
    case ActivityKey.POST_CREATED:
      return 'Created a post';
    case ActivityKey.POST_SCHEDULED:
      return 'Scheduled a post';
    case ActivityKey.POST_PUBLISHED:
      return 'Published a post';
    case ActivityKey.POST_FAILED:
      return 'Failed to publish post';

    // Articles
    case ActivityKey.ARTICLE_PROCESSING:
      return 'Generating an article...';
    case ActivityKey.ARTICLE_GENERATED:
      return 'Generated an article';
    case ActivityKey.ARTICLE_FAILED:
      return 'Failed to generate article';

    // Model Training
    case ActivityKey.MODELS_TRAINING_CREATED:
      return 'Started model training';
    case ActivityKey.MODELS_TRAINING_COMPLETED:
      return 'Completed model training';
    case ActivityKey.MODELS_TRAINING_FAILED:
      return 'Model training failed';

    // Credits
    case ActivityKey.CREDITS_ADD:
      return 'Credits added';
    case ActivityKey.CREDITS_REMOVE: {
      const sourceLabel = getActivitySourceLabel(activity.source);
      return sourceLabel || 'Credit deduction';
    }
    case ActivityKey.CREDITS_RESET:
      return 'Reset credits';
    case ActivityKey.CREDITS_REMOVE_ALL:
      return 'Removed all credits';

    // Social Integration
    case ActivityKey.SOCIAL_INTEGRATION_FAILED:
      return 'Social integration failed';
    case ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED:
      return 'Social account disconnected';

    default:
      return activity.label || activity.key;
  }
}

export function parsePostActivityValue(
  value: string,
): { platform?: Platform; url?: string } | null {
  // Try JSON first (future format)
  try {
    const parsed = JSON.parse(value);
    if (parsed.platform && parsed.url) {
      return { platform: parsed.platform, url: parsed.url };
    }
  } catch {
    // Fall through to string parsing
  }

  // Parse string format: "Published to twitter: https://..."
  const match = value.match(/Published to (\w+):\s*(https?:\/\/\S+)/i);
  if (match) {
    const platformStr = match[1].toLowerCase();
    const url = match[2];
    // Map platform string to Platform enum
    const platformMap: Record<string, Platform> = {
      facebook: Platform.FACEBOOK,
      instagram: Platform.INSTAGRAM,
      linkedin: Platform.LINKEDIN,
      medium: Platform.MEDIUM,
      pinterest: Platform.PINTEREST,
      reddit: Platform.REDDIT,
      tiktok: Platform.TIKTOK,
      twitter: Platform.TWITTER,
      x: Platform.TWITTER,
      youtube: Platform.YOUTUBE,
    };
    return { platform: platformMap[platformStr], url };
  }

  return null;
}
