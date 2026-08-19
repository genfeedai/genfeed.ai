import {
  computeNextRunAtOrThrow,
  isSchedulableTimezone,
} from '@api/collections/workflows/utils/cron-schedule.util';
import { describe, expect, it } from 'vitest';

describe('cron-schedule.util', () => {
  it('computes next run for a valid cron expression', () => {
    const nextRun = computeNextRunAtOrThrow('0 9 * * 1', 'UTC');
    expect(nextRun).toBeInstanceOf(Date);
  });

  it('computes 0 9 * * * in UTC as 09:00 UTC, not a viewer-local 2:00 AM', () => {
    const nextRun = computeNextRunAtOrThrow('0 9 * * *', 'UTC');
    expect(nextRun.getUTCHours()).toBe(9);
    expect(nextRun.getUTCMinutes()).toBe(0);
  });

  it('throws for an invalid cron expression', () => {
    expect(() => computeNextRunAtOrThrow('invalid-cron', 'UTC')).toThrow();
  });

  it('accepts a known IANA timezone', () => {
    expect(isSchedulableTimezone('UTC')).toBe(true);
    expect(isSchedulableTimezone('America/New_York')).toBe(true);
  });

  it('rejects empty or unknown timezones', () => {
    expect(isSchedulableTimezone(undefined)).toBe(false);
    expect(isSchedulableTimezone(null)).toBe(false);
    expect(isSchedulableTimezone('')).toBe(false);
    expect(isSchedulableTimezone('Not/AZone')).toBe(false);
  });
});
