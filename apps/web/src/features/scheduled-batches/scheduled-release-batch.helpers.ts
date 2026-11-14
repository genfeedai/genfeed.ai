import type { IScheduledReleaseBatchPost } from '@genfeedai/contracts/interfaces';
import type { PlatformPreviewTarget } from '@genfeedai/props/components/platform-preview.props';

export interface ScheduledReleaseBatchDay {
  /** `YYYY-MM-DD` in the post's own timezone, or `unscheduled`. */
  key: string;
  /** Posts of the day in the order the approval carries them. */
  posts: IScheduledReleaseBatchPost[];
}

export const UNSCHEDULED_DAY_KEY = 'unscheduled';

function zoneOrUndefined(timezone: string | null): string | undefined {
  if (!timezone) return undefined;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return timezone;
  } catch {
    return undefined;
  }
}

/** The calendar day a post publishes on, in the timezone the release names. */
export function getBatchPostDayKey(post: IScheduledReleaseBatchPost): string {
  if (!post.scheduledAt) return UNSCHEDULED_DAY_KEY;
  const date = new Date(post.scheduledAt);
  if (Number.isNaN(date.getTime())) return UNSCHEDULED_DAY_KEY;
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: zoneOrUndefined(post.timezone) ?? 'UTC',
    year: 'numeric',
  }).format(date);
}

/** Posts grouped by publishing day, days in time order. */
export function groupBatchPostsByDay(
  posts: readonly IScheduledReleaseBatchPost[],
): ScheduledReleaseBatchDay[] {
  const days = new Map<string, IScheduledReleaseBatchPost[]>();
  for (const post of posts) {
    const key = getBatchPostDayKey(post);
    days.set(key, [...(days.get(key) ?? []), post]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => {
      if (a === UNSCHEDULED_DAY_KEY) return 1;
      if (b === UNSCHEDULED_DAY_KEY) return -1;
      return a.localeCompare(b);
    })
    .map(([key, dayPosts]) => ({ key, posts: dayPosts }));
}

export function formatBatchPostTime(
  post: IScheduledReleaseBatchPost,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  if (!post.scheduledAt) return '';
  const date = new Date(post.scheduledAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: zoneOrUndefined(post.timezone) ?? 'UTC',
  }).format(date);
}

/** Posts a reviewer keeps, by position in the approval. */
export function getKeptBatchPosts(
  posts: readonly IScheduledReleaseBatchPost[],
  removedIndexes: ReadonlySet<number>,
): IScheduledReleaseBatchPost[] {
  return posts.filter((post) => !removedIndexes.has(post.index));
}

/** The preview the shared platform preview renders for one post. */
export function toBatchPreviewTarget(
  post: IScheduledReleaseBatchPost,
): PlatformPreviewTarget {
  return {
    author: {
      handle: post.accountHandle ?? undefined,
      name: post.accountLabel ?? undefined,
    },
    caption: post.text,
    id: `batch-post-${post.index}`,
    // Slides in publishing order; audio has no place in a post preview.
    media: post.media
      .filter((item) => item.kind !== 'audio')
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        id: `batch-post-${post.index}-${item.order}`,
        kind: item.kind === 'video' ? ('video' as const) : ('image' as const),
        url: item.url ?? undefined,
      })),
    platform: post.platform,
    publishMode: 'scheduled',
    settings: post.platform === 'instagram' ? { placement: 'feed' } : undefined,
  };
}
