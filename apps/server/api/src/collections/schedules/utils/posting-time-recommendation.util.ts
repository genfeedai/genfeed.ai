import type {
  PostingTimeRecommendation,
  PostingTimeWindow,
  PostingWindowPostInput,
  PostingWindowResult,
} from '@genfeedai/contracts/interfaces';
import { DEFAULT_POSTING_WINDOW_OPTIONS } from '@genfeedai/helpers';
import { DateTime } from 'luxon';

export interface PostingPostRow {
  id: string;
  publishedAt: Date | null;
}

export interface PostingMeasurementRow {
  postId: string | null;
  measuredAt: Date | null;
  engagementRate: number | null;
}

/** Platform guesses (local hours, end exclusive) shown until enough data exists. */
export const DEFAULT_POSTING_HOURS: Readonly<Record<string, number[][]>> = {
  facebook: [[13, 16]],
  general: [
    [9, 11],
    [12, 14],
    [17, 19],
  ],
  instagram: [
    [11, 13],
    [19, 21],
  ],
  linkedin: [
    [7, 8],
    [12, 13],
    [17, 18],
  ],
  tiktok: [
    [7, 9],
    [12, 15],
    [19, 23],
  ],
  twitter: [
    [8, 10],
    [12, 13],
    [17, 18],
  ],
  youtube: [
    [14, 16],
    [18, 20],
  ],
};

/**
 * One measurement per post for the ranking: the latest read inside the 24 to
 * 48 hour observation window; failing that the latest read at all, which the
 * ranking then counts as outside the window rather than using it. Posts with no
 * engagement rate get no measurement and are counted as unmeasured, not zero.
 */
export function toPostingWindowPosts(
  posts: readonly PostingPostRow[],
  measurements: readonly PostingMeasurementRow[],
): PostingWindowPostInput[] {
  const { observationMaxMs, observationMinMs } = DEFAULT_POSTING_WINDOW_OPTIONS;
  const byPost = new Map<string, { measuredAtMs: number; rate: number }[]>();
  for (const row of measurements) {
    if (!row.postId || !row.measuredAt || row.engagementRate === null) continue;
    byPost.set(row.postId, [
      ...(byPost.get(row.postId) ?? []),
      { measuredAtMs: row.measuredAt.getTime(), rate: row.engagementRate },
    ]);
  }

  const inputs: PostingWindowPostInput[] = [];
  for (const post of posts) {
    if (!post.publishedAt) continue;
    const publishedAtMs = post.publishedAt.getTime();
    const rows = (byPost.get(post.id) ?? []).sort(
      (a, b) => b.measuredAtMs - a.measuredAtMs,
    );
    const picked =
      rows.find((row) => {
        const age = row.measuredAtMs - publishedAtMs;
        return age >= observationMinMs && age <= observationMaxMs;
      }) ?? rows[0];
    inputs.push({
      id: post.id,
      isDeleted: false,
      isPromoted: null,
      measuredAtMs: picked ? picked.measuredAtMs : null,
      metric: picked ? picked.rate : null,
      publishedAtMs,
    });
  }
  return inputs;
}

function defaultWindows(platform: string): PostingTimeWindow[] {
  const hours =
    DEFAULT_POSTING_HOURS[platform] ?? DEFAULT_POSTING_HOURS.general;
  return hours.map(([startHour, endHour]) => ({
    endHour,
    median: null,
    sampleCount: null,
    startHour,
    weekday: null,
  }));
}

/** Shapes the ranking into the API answer; defaults are labelled as defaults. */
export function buildPostingTimeRecommendation(
  platform: string,
  result: PostingWindowResult,
): PostingTimeRecommendation {
  const { eligibleCount, options, spanDays, timezone } = result;
  const common = {
    eligibleCount,
    metric: 'engagementRate' as const,
    platform,
    spanDays: Math.round(spanDays * 10) / 10,
    timezone,
  };

  if (result.basis === 'learned') {
    return {
      ...common,
      basis: 'learned',
      method: 'median-by-slot',
      reasoning: [
        `Ranked by median engagement rate per ${options.slotHours}-hour slot in ${timezone}, from ${eligibleCount} posts over ${common.spanDays} days.`,
        `Each post is read ${options.observationMinMs / 3_600_000} to ${options.observationMaxMs / 3_600_000} hours after publishing; a slot needs at least ${options.minimumPostsPerSlot} posts to rank.`,
      ],
      windows: result.windows.map((window) => ({ ...window })),
    };
  }

  return {
    ...common,
    basis: 'default',
    method: 'platform-default',
    reasoning: [
      `Default times for ${platform}, not learned from your posts: ${eligibleCount} of ${options.minimumPosts} measured posts, over ${common.spanDays} of ${options.minimumSpanDays} days.`,
    ],
    windows: defaultWindows(platform),
  };
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * One line per learned window ("Thu 18:00-21:00"), best first. A result that
 * did not learn anything gives no lines: a default guess is not a finding.
 */
export function describeLearnedPostingWindows(
  result: PostingWindowResult,
): string[] {
  if (result.basis !== 'learned') return [];
  const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
  return result.windows.map(
    (window) =>
      `${WEEKDAY_LABELS[window.weekday] ?? '?'} ${pad(window.startHour)}-${pad(window.endHour)}`,
  );
}

/**
 * Instants for the platform default hours, one per slot starting tomorrow in
 * the account's timezone, so "9am" is 9am where the account is. The day is
 * added in local calendar days, which keeps the hour across a DST change.
 * Throws a RangeError for an unknown timezone.
 */
export function generateDefaultPostingTimes(
  count: number,
  platform: string | undefined,
  timezone: string,
  nowMs: number,
): Date[] {
  const windows =
    DEFAULT_POSTING_HOURS[platform?.toLowerCase() ?? 'general'] ??
    DEFAULT_POSTING_HOURS.general;
  const hours = windows.flatMap(([start, end]) =>
    Array.from({ length: end - start }, (_, offset) => start + offset),
  );

  const today = DateTime.fromMillis(nowMs, { zone: timezone });
  if (!today.isValid) {
    throw new RangeError(`Invalid time zone specified: ${timezone}`);
  }

  return Array.from({ length: count }, (_, index) =>
    today
      .plus({ days: 1 + Math.floor(index / hours.length) })
      .set({
        hour: hours[index % hours.length],
        millisecond: 0,
        minute: 0,
        second: 0,
      })
      .toJSDate(),
  );
}
