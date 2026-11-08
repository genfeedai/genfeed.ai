import type { AvatarTwinStatus } from '@genfeedai/contracts';

/** Payload kind of the bell item raised when a twin settles. */
export const AVATAR_TWIN_NOTIFICATION_KIND = 'avatar_twin';

/** Bell payload of a settled twin; the inbox links it to the twin page. */
export interface AvatarTwinNotificationPayload {
  version: 1;
  kind: typeof AVATAR_TWIN_NOTIFICATION_KIND;
  /** A brand the person can open, so the link lands inside the app. */
  brandId: string | null;
  status: AvatarTwinStatus;
  twinId: string;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How often a waiting twin is re-read at the provider, by its age. Training
 * usually settles within the first hour; consent can wait on the person for
 * days, so later checks space out.
 */
export const AVATAR_TWIN_TRACKING_STEPS = [
  { maxAgeMs: HOUR_MS, intervalMs: 2 * MINUTE_MS },
  { maxAgeMs: DAY_MS, intervalMs: 15 * MINUTE_MS },
  { maxAgeMs: 7 * DAY_MS, intervalMs: HOUR_MS },
] as const;

/** Past this age the background check stops; opening the twin page still refreshes it. */
export const AVATAR_TWIN_TRACKING_MAX_AGE_MS = 7 * DAY_MS;

/** An upload that never reached the provider within this window was interrupted. */
export const AVATAR_TWIN_UPLOAD_STALE_MS = 2 * HOUR_MS;

/** Twins re-read per sweep, so one sweep stays well inside provider rate limits. */
export const AVATAR_TWIN_TRACKING_BATCH = 50;

/** Whether a waiting twin is due for another provider read at `now`. */
export function isAvatarTwinTrackingDue(
  twin: { createdAt: Date; lastCheckedAt: Date | null },
  now: Date,
): boolean {
  const ageMs = now.getTime() - twin.createdAt.getTime();
  const step = AVATAR_TWIN_TRACKING_STEPS.find(
    (candidate) => ageMs < candidate.maxAgeMs,
  );
  if (!step) return false;
  if (!twin.lastCheckedAt) return true;
  return now.getTime() - twin.lastCheckedAt.getTime() >= step.intervalMs;
}
