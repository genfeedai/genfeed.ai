import { TargetExecutionState } from '@genfeedai/contracts';
import { DateTime } from 'luxon';

export const CALENDAR_DEFAULT_DAYS = 7;
export const CALENDAR_MAX_DAYS = 90;
export const CALENDAR_DEFAULT_LIMIT = 50;
export const CALENDAR_MAX_LIMIT = 100;
/** Most posts read to find gap days and the default timezone. */
export const CALENDAR_DAY_SCAN_LIMIT = 2000;

/** States that put a post on the day: it is queued, going out, or already out. */
export const CALENDAR_ACTIVE_STATES: readonly TargetExecutionState[] = [
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PUBLISHING,
  TargetExecutionState.PUBLISHED,
];

/** Every state but draft: the rows of the calendar, whatever became of them. */
export const CALENDAR_LISTED_STATES: TargetExecutionState[] = Object.values(
  TargetExecutionState,
).filter((state) => state !== TargetExecutionState.DRAFT);

export interface CalendarWindow {
  /** Local calendar days of the window, first to last, as YYYY-MM-DD. */
  dayKeys: string[];
  end: Date;
  start: Date;
  timezone: string;
}

export interface CalendarPostDay {
  scheduledDate?: unknown;
  targetExecutionState?: unknown;
  timezone?: unknown;
}

export function isValidTimezone(timezone: string): boolean {
  return DateTime.now().setZone(timezone).isValid;
}

/** The local calendar day (YYYY-MM-DD) an instant falls on in `timezone`. */
export function localDayKey(value: unknown, timezone: string): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = DateTime.fromJSDate(new Date(value), { zone: timezone });
  return date.isValid ? date.toISODate() : null;
}

/**
 * The window runs from the start of the local day `now` falls on to the start
 * of the local day `days` later, so every day it names is a whole local day.
 * Days are added as calendar days, which keeps them whole across DST changes.
 */
export function buildCalendarWindow(
  now: Date,
  days: number,
  timezone: string,
): CalendarWindow {
  const first = DateTime.fromJSDate(now, { zone: timezone }).startOf('day');
  const dayKeys = Array.from(
    { length: days },
    (_, index) => first.plus({ days: index }).toISODate() as string,
  );
  return {
    dayKeys,
    end: first.plus({ days }).toJSDate(),
    start: first.toJSDate(),
    timezone,
  };
}

/**
 * The timezone most scheduled posts were set in, so day buckets match how the
 * person scheduled them. UTC when no post says.
 */
export function mostCommonTimezone(posts: readonly CalendarPostDay[]): string {
  const counts = new Map<string, number>();
  for (const post of posts) {
    if (typeof post.timezone !== 'string' || !isValidTimezone(post.timezone)) {
      continue;
    }
    counts.set(post.timezone, (counts.get(post.timezone) ?? 0) + 1);
  }
  let best = 'UTC';
  let bestCount = 0;
  for (const [timezone, count] of counts) {
    if (count > bestCount) {
      best = timezone;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Days of the window with no queued, publishing or published post. Failed,
 * paused, cancelled and skipped posts do not fill a day: nothing goes out.
 */
export function findGapDays(
  window: CalendarWindow,
  posts: readonly CalendarPostDay[],
): string[] {
  const filled = new Set<string>();
  for (const post of posts) {
    if (
      !CALENDAR_ACTIVE_STATES.includes(
        post.targetExecutionState as TargetExecutionState,
      )
    ) {
      continue;
    }
    const day = localDayKey(post.scheduledDate, window.timezone);
    if (day) filled.add(day);
  }
  return window.dayKeys.filter((day) => !filled.has(day));
}

/** A whole number within `[min, max]`, or the default when absent; `null` when invalid. */
export function readBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max
    ? number
    : null;
}

export interface ContentCalendarArgs {
  brandId?: string;
  days: number;
  includeDrafts: boolean;
  limit: number;
  page: number;
  timezone?: string;
}

/** The validated `get_posts` calendar arguments, or a message saying what is wrong. */
export function parseContentCalendarArgs(
  params: Record<string, unknown>,
): ContentCalendarArgs | string {
  const days = readBoundedInteger(
    params.days,
    CALENDAR_DEFAULT_DAYS,
    1,
    CALENDAR_MAX_DAYS,
  );
  const limit = readBoundedInteger(
    params.limit,
    CALENDAR_DEFAULT_LIMIT,
    1,
    CALENDAR_MAX_LIMIT,
  );
  const page = readBoundedInteger(params.page, 1, 1, 10_000);
  if (days === null || limit === null || page === null) {
    return `days must be a whole number from 1 to ${CALENDAR_MAX_DAYS}, limit from 1 to ${CALENDAR_MAX_LIMIT}, and page 1 or more.`;
  }
  const timezone =
    typeof params.timezone === 'string' && params.timezone.trim()
      ? params.timezone.trim()
      : undefined;
  if (timezone && !isValidTimezone(timezone)) {
    return `timezone must be an IANA name such as Europe/Malta, not ${timezone}.`;
  }
  const brandId =
    typeof params.brandId === 'string' && params.brandId.trim()
      ? params.brandId.trim()
      : undefined;
  return {
    brandId,
    days,
    includeDrafts: params.includeDrafts === true,
    limit,
    page,
    timezone,
  };
}
