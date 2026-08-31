import type { ActivityMessageFormatter } from '@genfeedai/enums';
import {
  ActivityKey,
  ActivityKeys,
  ActivitySource,
  formatActivityMessage as formatEnglishActivityMessage,
  getActivityLifecycleStatus,
  getActivityMessageDescriptor,
  IngredientCategory,
  Platform,
  parseActivityKey,
} from '@genfeedai/enums';
import type { IActivity } from '@genfeedai/interfaces';

/**
 * Background / media-ish tasks that show progress UI.
 * Prefer lifecycle parsing over enumerating every key when possible.
 */
export const BACKGROUND_TASK_KEYS = [
  ActivityKeys.video.generate.processing,
  ActivityKeys.video.generate.completed,
  ActivityKeys.video.generate.finished,
  ActivityKeys.video.generate.failed,
  ActivityKeys.image.generate.processing,
  ActivityKeys.image.generate.completed,
  ActivityKeys.image.generate.failed,
  ActivityKeys.music.generate.processing,
  ActivityKeys.music.generate.completed,
  ActivityKeys.music.generate.failed,
  ActivityKeys.post.generate.completed,
  ActivityKeys.post.generate.created,
  ActivityKeys.post.generate.scheduled,
  ActivityKeys.post.generate.published,
  ActivityKeys.post.generate.failed,
  ActivityKeys.model.train.created,
  ActivityKeys.model.train.completed,
  ActivityKeys.model.train.failed,
  ActivityKeys.article.generate.processing,
  ActivityKeys.article.generate.completed,
  ActivityKeys.article.generate.failed,
] as const;

const CREDIT_ACTIVITY_KEYS = [
  ActivityKeys.credits.add,
  ActivityKeys.credits.remove,
  ActivityKeys.credits.removeAll,
  ActivityKeys.credits.reset,
] as const;

export function isCreditActivity(key: string): boolean {
  return (CREDIT_ACTIVITY_KEYS as readonly string[]).includes(key);
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

export function getActivitySourceLabel(
  source: string | undefined,
): string | undefined {
  if (!source) {
    return undefined;
  }
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
  if ((BACKGROUND_TASK_KEYS as readonly string[]).includes(activity.key)) {
    return true;
  }
  // New media keys with standard lifecycle suffixes still count.
  const { subject, lifecycle } = parseActivityKey(activity.key);
  const mediaSubjects = new Set([
    'image',
    'video',
    'music',
    'voice',
    'article',
    'post',
  ]);
  return (
    mediaSubjects.has(subject) &&
    (lifecycle === 'processing' ||
      lifecycle === 'completed' ||
      lifecycle === 'failed' ||
      lifecycle === 'created' ||
      lifecycle === 'scheduled' ||
      lifecycle === 'published')
  );
}

export function getBackgroundTaskStatus(
  key: string,
): 'processing' | 'completed' | 'failed' | 'pending' {
  return getActivityLifecycleStatus(key);
}

export function getResultTypeFromActivityKey(
  key: string,
): IngredientCategory | undefined {
  const { subject } = parseActivityKey(key);
  switch (subject) {
    case 'video':
      return IngredientCategory.VIDEO;
    case 'image':
      return IngredientCategory.IMAGE;
    case 'music':
      return IngredientCategory.MUSIC;
    default:
      return undefined;
  }
}

function parseCreditAmount(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = parseActivityValue(value);
  const raw =
    typeof parsed?.value === 'string' || typeof parsed?.value === 'number'
      ? String(parsed.value)
      : value;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : null;
}

export function getActivityCreditAmount(
  activity: Pick<IActivity, 'value'>,
): number | null {
  return parseCreditAmount(activity.value);
}

/**
 * Human-readable activity line.
 *
 * Catalog templates own copy. Never prefer stored/model labels — those used to
 * dump wire keys (`image-failed`) and JSON payloads (`Image {ingredientId…}`).
 */
export function getActivityDescription(
  activity: IActivity,
  formatActivityMessage: ActivityMessageFormatter = formatEnglishActivityMessage,
): string {
  const key = activity.key?.trim() ?? '';

  if (key === ActivityKey.POST_GENERATED) {
    const parsed = parseActivityValue(activity.value ?? '');
    const fromValue =
      (typeof parsed?.description === 'string' && parsed.description) ||
      (typeof parsed?.label === 'string' && parsed.label);
    if (fromValue && !fromValue.trim().startsWith('{')) {
      return fromValue.trim();
    }
  }

  if (isCreditActivity(key)) {
    const amount = parseCreditAmount(activity.value);
    const amountLabel = amount !== null ? amount.toLocaleString() : null;
    const sourceLabel = activity.source
      ? getActivitySourceLabel(activity.source)
      : undefined;
    const descriptor = getActivityMessageDescriptor(key);
    const contextualDescriptor = {
      ...descriptor,
      params: {
        ...descriptor.params,
        amount: amountLabel ?? 'none',
        source: sourceLabel ?? 'none',
      },
    };

    return formatActivityMessage(contextualDescriptor);
  }

  if (key) {
    return formatActivityMessage(getActivityMessageDescriptor(key));
  }

  const sourceLabel = activity.source
    ? getActivitySourceLabel(activity.source)
    : undefined;
  if (sourceLabel) {
    return sourceLabel;
  }

  return 'Activity recorded';
}

export function parsePostActivityValue(
  value: string,
): { platform?: Platform; url?: string } | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed.platform && parsed.url) {
      return { platform: parsed.platform, url: parsed.url };
    }
  } catch {
    // Fall through to string parsing
  }

  const match = value.match(/Published to (\w+):\s*(https?:\/\/\S+)/i);
  if (match) {
    const platformStr = match[1].toLowerCase();
    const url = match[2];
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
