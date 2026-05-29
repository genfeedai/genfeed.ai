import { ActivityKey, IngredientCategory } from '@genfeedai/enums';
import type {
  IActivity,
  IActivityPopulated,
  IBackgroundTask,
} from '@genfeedai/interfaces';

const FIVE_SECONDS_MS = 5_000;
const ONE_MINUTE_MS = 60_000;

// Background task keys that get special rendering
export const BACKGROUND_TASK_KEYS = [
  // Video lifecycle
  ActivityKey.VIDEO_PROCESSING,
  ActivityKey.VIDEO_GENERATED,
  ActivityKey.VIDEO_COMPLETED,
  ActivityKey.VIDEO_FAILED,
  // Image lifecycle
  ActivityKey.IMAGE_PROCESSING,
  ActivityKey.IMAGE_GENERATED,
  ActivityKey.IMAGE_FAILED,
  // Music lifecycle
  ActivityKey.MUSIC_PROCESSING,
  ActivityKey.MUSIC_GENERATED,
  ActivityKey.MUSIC_FAILED,
  // Post lifecycle
  ActivityKey.POST_GENERATED,
  ActivityKey.POST_CREATED,
  ActivityKey.POST_SCHEDULED,
  ActivityKey.POST_PUBLISHED,
  ActivityKey.POST_FAILED,
  // Model training lifecycle
  ActivityKey.MODELS_TRAINING_CREATED,
  ActivityKey.MODELS_TRAINING_COMPLETED,
  ActivityKey.MODELS_TRAINING_FAILED,
  // Article lifecycle
  ActivityKey.ARTICLE_PROCESSING,
  ActivityKey.ARTICLE_GENERATED,
  ActivityKey.ARTICLE_FAILED,
];

// Parse activity value JSON safely
export function parseActivityValue(
  value: string,
): Record<string, unknown> | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// Check if activity is a background task (merge, generation, post, etc.)
export function isBackgroundTask(activity: IActivity): boolean {
  return BACKGROUND_TASK_KEYS.includes(activity.key as ActivityKey);
}

// Activity key groupings for task type detection
export const VIDEO_KEYS = [
  ActivityKey.VIDEO_PROCESSING,
  ActivityKey.VIDEO_COMPLETED,
  ActivityKey.VIDEO_FAILED,
];
export const IMAGE_KEYS = [
  ActivityKey.IMAGE_PROCESSING,
  ActivityKey.IMAGE_GENERATED,
  ActivityKey.IMAGE_FAILED,
];
export const MUSIC_KEYS = [
  ActivityKey.MUSIC_PROCESSING,
  ActivityKey.MUSIC_GENERATED,
  ActivityKey.MUSIC_FAILED,
];
export const POST_KEYS = [
  ActivityKey.POST_GENERATED,
  ActivityKey.POST_CREATED,
  ActivityKey.POST_SCHEDULED,
  ActivityKey.POST_PUBLISHED,
  ActivityKey.POST_FAILED,
];
export const TRAINING_KEYS = [
  ActivityKey.MODELS_TRAINING_CREATED,
  ActivityKey.MODELS_TRAINING_COMPLETED,
  ActivityKey.MODELS_TRAINING_FAILED,
];
export const ARTICLE_KEYS = [
  ActivityKey.ARTICLE_PROCESSING,
  ActivityKey.ARTICLE_GENERATED,
  ActivityKey.ARTICLE_FAILED,
];

// Get task type from activity key
export function getTaskType(
  activity: IActivity,
): 'merge' | 'generation' | 'post' | 'training' | 'unknown' {
  const key = activity.key as ActivityKey;

  if (VIDEO_KEYS.includes(key)) {
    const parsed = parseActivityValue(activity.value);
    return parsed?.type === 'merge' ? 'merge' : 'generation';
  }

  if (
    IMAGE_KEYS.includes(key) ||
    MUSIC_KEYS.includes(key) ||
    ARTICLE_KEYS.includes(key)
  ) {
    return 'generation';
  }

  if (POST_KEYS.includes(key)) {
    return 'post';
  }

  if (TRAINING_KEYS.includes(key)) {
    return 'training';
  }

  return 'unknown';
}

// Status mappings for activity keys
export const COMPLETED_KEYS = new Set([
  ActivityKey.VIDEO_COMPLETED,
  ActivityKey.VIDEO_GENERATED,
  ActivityKey.IMAGE_GENERATED,
  ActivityKey.MUSIC_GENERATED,
  ActivityKey.POST_GENERATED,
  ActivityKey.POST_PUBLISHED,
  ActivityKey.MODELS_TRAINING_COMPLETED,
  ActivityKey.ARTICLE_GENERATED,
]);

export const FAILED_KEYS = new Set([
  ActivityKey.VIDEO_FAILED,
  ActivityKey.IMAGE_FAILED,
  ActivityKey.MUSIC_FAILED,
  ActivityKey.POST_FAILED,
  ActivityKey.MODELS_TRAINING_FAILED,
  ActivityKey.ARTICLE_FAILED,
]);

// Get background task status from activity key
export function getBackgroundTaskStatus(
  key: string,
): 'processing' | 'completed' | 'failed' {
  if (COMPLETED_KEYS.has(key as ActivityKey)) {
    return 'completed';
  }
  if (FAILED_KEYS.has(key as ActivityKey)) {
    return 'failed';
  }
  return 'processing';
}

// Get result type (category) from activity key
export function getResultTypeFromActivityKey(
  key: string,
): IngredientCategory | undefined {
  if (VIDEO_KEYS.includes(key as ActivityKey)) {
    return IngredientCategory.VIDEO;
  }
  if (IMAGE_KEYS.includes(key as ActivityKey)) {
    return IngredientCategory.IMAGE;
  }
  if (MUSIC_KEYS.includes(key as ActivityKey)) {
    return IngredientCategory.MUSIC;
  }
  return undefined;
}

// Extract and truncate post description for display
export function extractPostDescription(
  description: string | undefined | null,
  maxLength = 60,
): string | null {
  if (!description) {
    return null;
  }

  // Strip HTML tags
  const textOnly = description.replace(/<[^>]*>/g, '').trim();

  if (!textOnly) {
    return null;
  }

  // Truncate if needed
  if (textOnly.length <= maxLength) {
    return textOnly;
  }

  // Truncate at word boundary if possible
  const truncated = textOnly.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    // If we can find a space reasonably close to the end, use it
    return `${truncated.substring(0, lastSpace)}…`;
  }

  return `${truncated}…`;
}

// Get default label for a task based on its type and activity key
export function getTaskLabel(
  activity: IActivity,
  taskType: ReturnType<typeof getTaskType>,
  parsed: Record<string, unknown> | null,
): string {
  const key = activity.key as ActivityKey;

  switch (taskType) {
    case 'merge':
      return 'Video Merge';

    case 'generation': {
      if (IMAGE_KEYS.includes(key)) {
        return 'Image Generation';
      }
      if (VIDEO_KEYS.includes(key)) {
        return 'Video Generation';
      }
      if (MUSIC_KEYS.includes(key)) {
        return 'Music Generation';
      }
      if (ARTICLE_KEYS.includes(key)) {
        return 'Article Generation';
      }
      return 'Content Generation';
    }

    case 'post': {
      const populatedActivity = activity as IActivityPopulated;
      const postDescription =
        populatedActivity.post?.description ||
        parsed?.description ||
        parsed?.sentence ||
        null;
      return (
        extractPostDescription(postDescription as string | null) ||
        'Post Publishing'
      );
    }

    case 'training':
      return 'Model Training';

    default:
      return 'Background Task';
  }
}

function formatEtaDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatEtaRange(durationMs: number): string {
  const lowerBound = Math.max(FIVE_SECONDS_MS, Math.round(durationMs * 0.7));
  const upperBound = Math.round(durationMs * 1.35);

  if (upperBound < ONE_MINUTE_MS) {
    return `${Math.round(lowerBound / 1000)}-${Math.round(upperBound / 1000)}s`;
  }

  return `${Math.round(lowerBound / ONE_MINUTE_MS)}-${Math.round(
    upperBound / ONE_MINUTE_MS,
  )} min`;
}

export function getTaskEtaLabel(task: IBackgroundTask): string | null {
  if (!task.estimatedDurationMs) {
    return null;
  }

  if (task.etaConfidence === 'low') {
    return `Usually ${formatEtaRange(task.estimatedDurationMs)}`;
  }

  return `About ${formatEtaDuration(
    task.remainingDurationMs ?? task.estimatedDurationMs,
  )} left`;
}

export function getTaskElapsedLabel(task: IBackgroundTask): string | null {
  if (!task.startedAt) {
    return null;
  }

  const startedAtMs = new Date(task.startedAt).getTime();
  if (Number.isNaN(startedAtMs)) {
    return null;
  }

  return formatEtaDuration(Math.max(1_000, Date.now() - startedAtMs));
}
