import type { ActivityMessageFormatter } from '@genfeedai/contracts';
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
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createArtifactEditorRoute,
  createLibraryAssetRoute,
} from '@genfeedai/contracts/constants';
import type {
  IActivity,
  IActivityPopulated,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';

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
    'prompt',
    'avatar',
    'asset',
    'workflow',
    'model',
    'newsletter',
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
    case 'avatar':
      return IngredientCategory.IMAGE;
    case 'music':
      return IngredientCategory.MUSIC;
    default:
      return undefined;
  }
}

export function getActivityAssetId(
  activity: IActivity,
  parsed: Record<string, unknown> | null = parseActivityValue(activity.value),
): string | undefined {
  if (typeof parsed?.resultId === 'string' && parsed.resultId) {
    return parsed.resultId;
  }
  if (typeof parsed?.ingredientId === 'string' && parsed.ingredientId) {
    return parsed.ingredientId;
  }
  return activity.entityId || undefined;
}

/**
 * Preview URL for an activity thumbnail. Populated ingredients and explicit
 * media URLs win; otherwise a CDN path is derived from the ingredient id so
 * completed (and already-written processing) generations show the asset.
 */
export function getActivityMediaPreviewUrl(
  activity: IActivity,
  options: {
    getPreviewUrl?: (
      ingredient: Record<string, unknown>,
      category: IngredientCategory,
    ) => string | undefined;
    parsedMediaUrl?: string;
    resultId?: string;
    resultType?: IngredientCategory;
    status?: 'processing' | 'completed' | 'failed' | 'pending';
  } = {},
): string | undefined {
  const resultType =
    options.resultType ?? getResultTypeFromActivityKey(activity.key);
  const populated = (activity as IActivityPopulated).ingredient;
  if (populated && resultType && options.getPreviewUrl) {
    const fromIngredient = options.getPreviewUrl(
      populated as unknown as Record<string, unknown>,
      resultType,
    );
    if (fromIngredient) {
      return fromIngredient;
    }
  }

  if (options.parsedMediaUrl) {
    return options.parsedMediaUrl;
  }

  const parsed = parseActivityValue(activity.value);
  if (typeof parsed?.url === 'string' && parsed.url) {
    return parsed.url;
  }
  if (
    activity.value &&
    (activity.value.includes('/images/') || activity.value.includes('/videos/'))
  ) {
    return activity.value;
  }

  const status = options.status ?? getBackgroundTaskStatus(activity.key);
  if (status === 'failed') {
    return undefined;
  }

  const assetId = options.resultId || getActivityAssetId(activity, parsed);
  if (!assetId || !resultType) {
    return undefined;
  }

  if (
    resultType === IngredientCategory.IMAGE ||
    resultType === IngredientCategory.AVATAR
  ) {
    return `${EnvironmentService.ingredientsEndpoint}/images/${assetId}`;
  }
  if (resultType === IngredientCategory.VIDEO) {
    return `${EnvironmentService.cdnUrl}/ingredients/thumbnails/${assetId}`;
  }
  return undefined;
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
    const amountLabel = amount !== null ? amount.toLocaleString('en-US') : null;
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

export type ActivityTypeKind =
  | 'article'
  | 'audio'
  | 'credits'
  | 'image'
  | 'other'
  | 'post'
  | 'social'
  | 'video'
  | 'workflow';

const MEDIA_SUBJECTS = new Set([
  'audio',
  'avatar',
  'image',
  'music',
  'video',
  'voice',
]);

export function getActivityTypeKind(activity: IActivity): ActivityTypeKind {
  const { subject } = parseActivityKey(activity.key);
  if (subject === 'image' || subject === 'avatar') return 'image';
  if (subject === 'video') return 'video';
  if (subject === 'music' || subject === 'audio' || subject === 'voice') {
    return 'audio';
  }
  if (subject === 'social' || subject === 'integration') return 'social';
  if (subject === 'workflow') return 'workflow';
  if (subject === 'article') return 'article';
  if (subject === 'post') return 'post';
  if (isCreditActivity(activity.key)) return 'credits';
  return 'other';
}

export function getActivityDetailText(activity: IActivity): string | undefined {
  const value = activity.value?.trim();
  if (!value) {
    return undefined;
  }
  if (isCreditActivity(activity.key) || value.startsWith('Published to')) {
    return undefined;
  }
  const parsed = parseActivityValue(value);
  if (parsed) {
    const error =
      typeof parsed.error === 'string' ? parsed.error.trim() : undefined;
    if (error) {
      return error;
    }
    return undefined;
  }
  if (value.includes('/images/') || value.includes('/videos/')) {
    return undefined;
  }
  return value;
}

export function getActivityDestinationPath(
  activity: IActivity,
): string | undefined {
  const value = parseActivityValue(activity.value);
  if (typeof value?.href === 'string' && value.href.startsWith('/')) {
    return value.href;
  }

  const { subject } = parseActivityKey(activity.key);
  if (subject === 'social' || subject === 'integration') {
    return APP_ROUTES.SETTINGS.INTEGRATIONS;
  }

  const entityModel = activity.entityModel?.toLowerCase();
  const id =
    activity.entityId ||
    (typeof value?.resultId === 'string' ? value.resultId : undefined) ||
    (typeof value?.ingredientId === 'string'
      ? value.ingredientId
      : undefined) ||
    (['article', 'post'].includes(subject) &&
    /^[a-zA-Z0-9_-]+$/.test(activity.value)
      ? activity.value
      : undefined);

  if (id && (entityModel === 'ingredient' || MEDIA_SUBJECTS.has(subject))) {
    return createLibraryAssetRoute(
      activity.source === 'avatar-generate' ? 'AVATAR' : subject,
      id,
    );
  }
  if (id && (entityModel === 'article' || subject === 'article')) {
    return createArtifactEditorRoute('article', encodeURIComponent(id));
  }
  if (id && (entityModel === 'post' || subject === 'post')) {
    return createArtifactEditorRoute('post', encodeURIComponent(id));
  }
  if (id && entityModel === 'workflow') {
    return `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${encodeURIComponent(id)}`;
  }
  if (MEDIA_SUBJECTS.has(subject)) {
    return createLibraryAssetRoute(
      activity.source === 'avatar-generate' ? 'AVATAR' : subject,
    );
  }
  return undefined;
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
