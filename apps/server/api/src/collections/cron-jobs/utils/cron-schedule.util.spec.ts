import {
  computeNextRunAtOrThrow,
  isSchedulableTimezone,
} from '@api/collections/cron-jobs/utils/cron-schedule.util';
import { describe, expect, it } from 'vitest';

describe('cron-schedule.util', () => {
  it('returns a future Date for a valid cron expression', () => {
    const next = computeNextRunAtOrThrow('0 0 * * *', 'UTC');

    expect(next).toBeInstanceOf(Date);
    expect(next.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('accepts real IANA timezones and rejects blank or unknown zones', () => {
    expect(isSchedulableTimezone('UTC')).toBe(true);
    expect(isSchedulableTimezone('America/New_York')).toBe(true);
    expect(isSchedulableTimezone('')).toBe(false);
    expect(isSchedulableTimezone('   ')).toBe(false);
    expect(isSchedulableTimezone(null)).toBe(false);
    expect(isSchedulableTimezone('Not/AZone')).toBe(false);
  });
});
