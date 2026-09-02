import type { CampaignRateLimits } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';

export const REPLY_SLOT_HOUR_MS = 3600 * 1000;
export const REPLY_SLOT_DAY_MS = 86400 * 1000;
export const DEFAULT_REPLY_MAX_PER_HOUR = 10;
export const DEFAULT_REPLY_MAX_PER_DAY = 50;

export type NormalizedReplyRateLimits = {
  currentDayCount: number;
  currentHourCount: number;
  dayResetAt: Date;
  hourResetAt: Date;
  maxPerDay: number;
  maxPerHour: number;
};

export type ReplySlotEvaluation =
  | { allowed: false }
  | { allowed: true; next: NormalizedReplyRateLimits };

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toDate(value: Date | string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isWindowExpired(resetAt: Date | undefined, now: Date): boolean {
  return !resetAt || now.getTime() >= resetAt.getTime();
}

/**
 * Normalize hourly and daily windows against a fixed clock before any
 * eligibility decision. Expired windows reset their counters independently so
 * an hourly rollover cannot skip the daily cap, and a daily rollover cannot
 * skip the hourly cap.
 */
export function normalizeReplyRateLimitWindows(
  rateLimits: CampaignRateLimits | undefined,
  now: Date,
): NormalizedReplyRateLimits {
  const hourResetAt = toDate(rateLimits?.hourResetAt);
  const dayResetAt = toDate(rateLimits?.dayResetAt);
  const hourExpired = isWindowExpired(hourResetAt, now);
  const dayExpired = isWindowExpired(dayResetAt, now);

  return {
    currentDayCount: dayExpired
      ? 0
      : toFiniteNumber(rateLimits?.currentDayCount, 0),
    currentHourCount: hourExpired
      ? 0
      : toFiniteNumber(rateLimits?.currentHourCount, 0),
    dayResetAt: dayExpired
      ? new Date(now.getTime() + REPLY_SLOT_DAY_MS)
      : (dayResetAt ?? new Date(now.getTime() + REPLY_SLOT_DAY_MS)),
    hourResetAt: hourExpired
      ? new Date(now.getTime() + REPLY_SLOT_HOUR_MS)
      : (hourResetAt ?? new Date(now.getTime() + REPLY_SLOT_HOUR_MS)),
    maxPerDay: toFiniteNumber(rateLimits?.maxPerDay, DEFAULT_REPLY_MAX_PER_DAY),
    maxPerHour: toFiniteNumber(
      rateLimits?.maxPerHour,
      DEFAULT_REPLY_MAX_PER_HOUR,
    ),
  };
}

export function evaluateReplySlotReservation(
  rateLimits: CampaignRateLimits | undefined,
  now: Date,
): ReplySlotEvaluation {
  const normalized = normalizeReplyRateLimitWindows(rateLimits, now);

  if (
    normalized.maxPerHour <= 0 ||
    normalized.maxPerDay <= 0 ||
    normalized.currentHourCount >= normalized.maxPerHour ||
    normalized.currentDayCount >= normalized.maxPerDay
  ) {
    return { allowed: false };
  }

  return {
    allowed: true,
    next: {
      ...normalized,
      currentDayCount: normalized.currentDayCount + 1,
      currentHourCount: normalized.currentHourCount + 1,
    },
  };
}

export function mergeReservedRateLimits(
  existing: CampaignRateLimits | undefined,
  next: NormalizedReplyRateLimits,
): CampaignRateLimits {
  return {
    ...existing,
    currentDayCount: next.currentDayCount,
    currentHourCount: next.currentHourCount,
    dayResetAt: next.dayResetAt.toISOString(),
    hourResetAt: next.hourResetAt.toISOString(),
    maxPerDay: next.maxPerDay,
    maxPerHour: next.maxPerHour,
  };
}
