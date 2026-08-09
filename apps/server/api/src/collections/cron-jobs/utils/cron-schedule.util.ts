import { CronJob as CronParser } from 'cron';

export function computeNextRunAtOrThrow(
  schedule: string,
  timezone: string | undefined,
): Date {
  const parser = new CronParser(
    schedule,
    () => undefined,
    null,
    false,
    timezone ?? 'UTC',
  );

  return parser.nextDate().toJSDate();
}

/**
 * A cron expression alone is not schedulable — the timezone is half of the
 * schedule, and `CronJob` throws on an unknown IANA zone. Callers that persist
 * a user-supplied timezone must reject it up front instead of storing a value
 * that only explodes later, inside the scheduler.
 *
 * Probed with a fixed, known-valid expression so the result reports on the
 * timezone alone.
 */
const TIMEZONE_PROBE_SCHEDULE = '0 0 * * *';

export function isSchedulableTimezone(
  timezone: string | null | undefined,
): boolean {
  if (typeof timezone !== 'string') {
    return false;
  }

  const trimmed = timezone.trim();
  if (!trimmed) {
    return false;
  }

  try {
    computeNextRunAtOrThrow(TIMEZONE_PROBE_SCHEDULE, trimmed);
    return true;
  } catch {
    return false;
  }
}
