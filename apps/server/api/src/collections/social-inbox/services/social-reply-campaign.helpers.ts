const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function hourWindowStart(now: Date): Date {
  return new Date(now.getTime() - HOUR_MS);
}

export function dayWindowStart(now: Date): Date {
  return new Date(now.getTime() - DAY_MS);
}

export interface ThrottleDecision {
  /** Seconds to wait before the next dispatch attempt. `0` means send now. */
  delaySeconds: number;
  /** Why the tick was held back, for the campaign's `lastError`-free log line. */
  reason?: 'daily-window' | 'hourly-window' | 'min-delay';
}

/**
 * Pure pacing decision, re-derived from persisted send timestamps on every
 * tick. Nothing is cached in memory, so a worker restart or a redeploy mid-run
 * cannot double-spend a rate-limit window.
 */
export function decideThrottle(params: {
  dailyCount: number;
  hourlyCount: number;
  lastSentAt: Date | null;
  maxPerDay: number;
  maxPerHour: number;
  minDelaySeconds: number;
  now: Date;
  oldestInDayAt: Date | null;
  oldestInHourAt: Date | null;
}): ThrottleDecision {
  const {
    dailyCount,
    hourlyCount,
    lastSentAt,
    maxPerDay,
    maxPerHour,
    minDelaySeconds,
    now,
    oldestInDayAt,
    oldestInHourAt,
  } = params;

  if (dailyCount >= maxPerDay) {
    return {
      delaySeconds: secondsUntilWindowFrees(oldestInDayAt, now, DAY_MS),
      reason: 'daily-window',
    };
  }

  if (hourlyCount >= maxPerHour) {
    return {
      delaySeconds: secondsUntilWindowFrees(oldestInHourAt, now, HOUR_MS),
      reason: 'hourly-window',
    };
  }

  if (lastSentAt) {
    const elapsedSeconds = (now.getTime() - lastSentAt.getTime()) / 1000;
    const remaining = Math.ceil(minDelaySeconds - elapsedSeconds);
    if (remaining > 0) {
      return { delaySeconds: remaining, reason: 'min-delay' };
    }
  }

  return { delaySeconds: 0 };
}

/**
 * A sliding window frees up exactly when its oldest send ages out. Falling back
 * to the full window length keeps a missing timestamp conservative rather than
 * letting the campaign burst.
 */
function secondsUntilWindowFrees(
  oldestAt: Date | null,
  now: Date,
  windowMs: number,
): number {
  if (!oldestAt) {
    return Math.ceil(windowMs / 1000);
  }

  const freesAt = oldestAt.getTime() + windowMs;
  return Math.max(Math.ceil((freesAt - now.getTime()) / 1000), 1);
}

/**
 * Renders the campaign body for one recipient. Only `{{handle}}` and `{{name}}`
 * are supported — an unknown placeholder is left verbatim so a typo is visible
 * in review rather than silently blanking part of the message.
 */
export function renderCampaignBody(
  template: string,
  values: { handle?: string | null; name?: string | null },
): string {
  return template
    .replace(/\{\{\s*handle\s*\}\}/gu, values.handle ?? '')
    .replace(/\{\{\s*name\s*\}\}/gu, values.name ?? '');
}
