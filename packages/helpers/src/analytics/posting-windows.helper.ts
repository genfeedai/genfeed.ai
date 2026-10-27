import type {
  PostingWindow,
  PostingWindowExclusionReason,
  PostingWindowInput,
  PostingWindowOptions,
  PostingWindowPostInput,
  PostingWindowResult,
} from '@genfeedai/contracts/interfaces';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  Fri: 4,
  Mon: 0,
  Sat: 5,
  Sun: 6,
  Thu: 3,
  Tue: 1,
  Wed: 2,
};

/** The accepted rule (#6769): 20 posts over 28 days, 3 per 3-hour slot, read at 24 to 48 hours. */
export const DEFAULT_POSTING_WINDOW_OPTIONS: Readonly<PostingWindowOptions> = {
  minimumPosts: 20,
  minimumPostsPerSlot: 3,
  minimumSpanDays: 28,
  observationMaxMs: 2 * DAY_MS,
  observationMinMs: DAY_MS,
  slotHours: 3,
  topCount: 3,
};

function resolveOptions(
  options: PostingWindowInput['options'],
): PostingWindowOptions {
  const resolved = { ...DEFAULT_POSTING_WINDOW_OPTIONS, ...options };
  if (!Number.isInteger(resolved.slotHours) || 24 % resolved.slotHours !== 0) {
    throw new RangeError('Posting window slotHours must divide 24');
  }
  if (
    !Number.isInteger(resolved.minimumPosts) ||
    resolved.minimumPosts < 1 ||
    !Number.isInteger(resolved.minimumPostsPerSlot) ||
    resolved.minimumPostsPerSlot < 1 ||
    !Number.isInteger(resolved.topCount) ||
    resolved.topCount < 1
  ) {
    throw new RangeError('Posting window counts must be positive integers');
  }
  if (
    !Number.isFinite(resolved.minimumSpanDays) ||
    resolved.minimumSpanDays < 0 ||
    !Number.isFinite(resolved.observationMinMs) ||
    resolved.observationMinMs < 0 ||
    !Number.isFinite(resolved.observationMaxMs) ||
    resolved.observationMaxMs < resolved.observationMinMs
  ) {
    throw new RangeError('Posting window time options are out of range');
  }
  return resolved;
}

function createSlotFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone,
      weekday: 'short',
    });
  } catch {
    throw new RangeError(`Posting window timezone is invalid: ${timezone}`);
  }
}

/** Local weekday (Monday is 0) and hour of one instant; DST is per instant. */
function localSlot(
  formatter: Intl.DateTimeFormat,
  instantMs: number,
): { hour: number; weekday: number } {
  let weekday = 0;
  let hour = 0;
  for (const part of formatter.formatToParts(new Date(instantMs))) {
    if (part.type === 'weekday') weekday = WEEKDAY_INDEX[part.value] ?? 0;
    if (part.type === 'hour') hour = Number(part.value) % 24;
  }
  return { hour, weekday };
}

function exclusionReason(
  post: Readonly<PostingWindowPostInput>,
  nowMs: number,
  options: PostingWindowOptions,
): PostingWindowExclusionReason | null {
  if (post.isDeleted) return 'soft_deleted';
  if (post.isPromoted === true) return 'promoted';
  if (!Number.isSafeInteger(post.publishedAtMs)) return 'invalid_publish_date';
  if (post.publishedAtMs > nowMs) return 'not_yet_published';
  if (post.metric === null || post.measuredAtMs === null) return 'no_metrics';
  if (!Number.isFinite(post.metric) || post.metric < 0) return 'invalid_metric';
  const ageAtMeasurement = post.measuredAtMs - post.publishedAtMs;
  if (
    !Number.isFinite(ageAtMeasurement) ||
    ageAtMeasurement < options.observationMinMs ||
    ageAtMeasurement > options.observationMaxMs
  ) {
    return 'outside_observation_window';
  }
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : sorted[middle - 1] + (sorted[middle] - sorted[middle - 1]) / 2;
}

function emptyExclusions(): Record<PostingWindowExclusionReason, number> {
  return {
    invalid_metric: 0,
    invalid_publish_date: 0,
    no_metrics: 0,
    not_yet_published: 0,
    outside_observation_window: 0,
    promoted: 0,
    soft_deleted: 0,
  };
}

/**
 * Ranks the account's local weekday-by-hour slots by the median of one metric,
 * read in a fixed window after publishing so posts are compared at the same
 * age. No I/O and no clock reads; callers authorize and scope their data first.
 * Below the sample minimums it returns `insufficient_data` and no windows, so
 * callers show their default times and never call them learned. Posts with no
 * metric are counted in `excluded`, never scored as zero; an observed zero is
 * a real value.
 *
 * One pass over M posts plus a sort of the S occupied slots (S <= 168):
 * O(M + S log S) time, O(M) memory.
 */
export function computePostingWindows(
  input: PostingWindowInput,
): PostingWindowResult {
  const options = resolveOptions(input.options);
  const formatter = createSlotFormatter(input.timezone);
  const excluded = emptyExclusions();
  const slots = new Map<number, { metrics: number[]; weekday: number }>();
  let eligibleCount = 0;
  let firstPublishedMs = Number.POSITIVE_INFINITY;
  let lastPublishedMs = Number.NEGATIVE_INFINITY;

  for (const post of input.posts) {
    const reason = exclusionReason(post, input.nowMs, options);
    if (reason) {
      excluded[reason] += 1;
      continue;
    }
    eligibleCount += 1;
    firstPublishedMs = Math.min(firstPublishedMs, post.publishedAtMs);
    lastPublishedMs = Math.max(lastPublishedMs, post.publishedAtMs);
    const { hour, weekday } = localSlot(formatter, post.publishedAtMs);
    const startHour = Math.floor(hour / options.slotHours) * options.slotHours;
    const key = weekday * 24 + startHour;
    const slot = slots.get(key) ?? { metrics: [], weekday };
    slot.metrics.push(post.metric as number);
    slots.set(key, slot);
  }

  const spanDays =
    eligibleCount === 0 ? 0 : (lastPublishedMs - firstPublishedMs) / DAY_MS;
  const base = {
    excluded,
    eligibleCount,
    method: 'median-by-slot' as const,
    options,
    spanDays,
    timezone: input.timezone,
  };

  if (
    eligibleCount < options.minimumPosts ||
    spanDays < options.minimumSpanDays
  ) {
    return {
      ...base,
      basis: 'default',
      status: 'insufficient_data',
      windows: [],
    };
  }

  const ranked = [...slots.entries()]
    .filter(([, slot]) => slot.metrics.length >= options.minimumPostsPerSlot)
    .map(([key, slot]) => ({
      key,
      window: {
        endHour: (key % 24) + options.slotHours,
        median: median(slot.metrics),
        sampleCount: slot.metrics.length,
        startHour: key % 24,
        weekday: slot.weekday,
      } satisfies PostingWindow,
    }))
    .sort(
      (a, b) =>
        b.window.median - a.window.median ||
        b.window.sampleCount - a.window.sampleCount ||
        a.key - b.key,
    )
    .slice(0, options.topCount)
    .map(({ window }) => window);

  if (ranked.length === 0) {
    return {
      ...base,
      basis: 'default',
      status: 'insufficient_data',
      windows: [],
    };
  }
  return { ...base, basis: 'learned', status: 'ready', windows: ranked };
}
