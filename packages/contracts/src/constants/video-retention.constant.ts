/**
 * How long a generated video file stays in storage, counted from the day the
 * video was created. Organizations with a paid subscription keep it longer than
 * pay-as-you-go organizations. Only deployments with organization billing
 * enforce this; self-hosted installs keep their files.
 */
export const VIDEO_RETENTION_DAYS = {
  PAYG: 7,
  SUBSCRIBER: 30,
} as const;

export function videoRetentionDays(isSubscriber: boolean): number {
  return isSubscriber
    ? VIDEO_RETENTION_DAYS.SUBSCRIBER
    : VIDEO_RETENTION_DAYS.PAYG;
}
