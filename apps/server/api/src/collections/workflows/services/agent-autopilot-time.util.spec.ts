import {
  getNextDailyReset,
  getNextWeeklyReset,
} from '@api/collections/workflows/services/agent-autopilot-time.util';
import { afterEach, describe, expect, it } from 'vitest';

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe.each(['UTC', 'America/Los_Angeles', 'Pacific/Auckland'])(
  'autopilot credit reset boundaries with TZ=%s',
  (timeZone) => {
    it('resets daily at the next 00:00 UTC', () => {
      process.env.TZ = timeZone;
      const now = new Date('2026-10-04T23:30:00.000Z');
      expect(getNextDailyReset(now).toISOString()).toBe(
        '2026-10-05T00:00:00.000Z',
      );
      expect(
        getNextDailyReset(new Date('2026-10-04T00:00:00.000Z')).toISOString(),
      ).toBe('2026-10-05T00:00:00.000Z');
    });

    it('resets weekly at the next Monday 00:00 UTC', () => {
      process.env.TZ = timeZone;
      // Sunday, Monday and Saturday in UTC.
      expect(
        getNextWeeklyReset(new Date('2026-10-04T12:00:00.000Z')).toISOString(),
      ).toBe('2026-10-05T00:00:00.000Z');
      expect(
        getNextWeeklyReset(new Date('2026-10-05T00:00:00.000Z')).toISOString(),
      ).toBe('2026-10-12T00:00:00.000Z');
      expect(
        getNextWeeklyReset(new Date('2026-10-10T23:59:59.000Z')).toISOString(),
      ).toBe('2026-10-12T00:00:00.000Z');
    });
  },
);
