import {
  resolveScheduledBlastDueTime,
  toScheduledBlastLocalDateTime,
} from '@helpers/formatting/timezone/scheduled-blast-due-time';
import { describe, expect, it } from 'vitest';

const FIXED_NOW = new Date('2026-08-24T12:00:00.000Z');

describe('resolveScheduledBlastDueTime', () => {
  it('round-trips a valid future local time in America/New_York', () => {
    const resolved = resolveScheduledBlastDueTime({
      localDateTime: '2026-08-25T09:00',
      now: FIXED_NOW,
      timezone: 'America/New_York',
    });

    expect(resolved).toEqual({
      ok: true,
      value: {
        dueAt: new Date('2026-08-25T13:00:00.000Z'),
        localDateTime: '2026-08-25T09:00',
        timezone: 'America/New_York',
      },
    });
  });

  it('round-trips the same wall clock in Tokyo across the date line', () => {
    const resolved = resolveScheduledBlastDueTime({
      localDateTime: '2026-08-25T09:00',
      now: FIXED_NOW,
      timezone: 'Asia/Tokyo',
    });

    expect(resolved).toEqual({
      ok: true,
      value: {
        dueAt: new Date('2026-08-25T00:00:00.000Z'),
        localDateTime: '2026-08-25T09:00',
        timezone: 'Asia/Tokyo',
      },
    });
  });

  it('rejects a missing local time or timezone before computing UTC', () => {
    expect(
      resolveScheduledBlastDueTime({
        now: FIXED_NOW,
        timezone: 'UTC',
      }),
    ).toEqual({ error: 'missing_schedule', ok: false });
    expect(
      resolveScheduledBlastDueTime({
        localDateTime: '2026-08-25T09:00',
        now: FIXED_NOW,
      }),
    ).toEqual({ error: 'missing_schedule', ok: false });
    expect(
      resolveScheduledBlastDueTime({
        localDateTime: '   ',
        now: FIXED_NOW,
        timezone: 'UTC',
      }),
    ).toEqual({ error: 'missing_schedule', ok: false });
  });

  it('rejects an invalid IANA timezone', () => {
    expect(
      resolveScheduledBlastDueTime({
        localDateTime: '2026-08-25T09:00',
        now: FIXED_NOW,
        timezone: 'Mars/Olympus',
      }),
    ).toEqual({ error: 'invalid_timezone', ok: false });
  });

  it('rejects malformed and impossible local date-times', () => {
    expect(
      resolveScheduledBlastDueTime({
        localDateTime: '2026-08-25',
        now: FIXED_NOW,
        timezone: 'UTC',
      }),
    ).toEqual({ error: 'invalid_local_date_time', ok: false });
    expect(
      resolveScheduledBlastDueTime({
        localDateTime: '2026-02-31T09:00',
        now: FIXED_NOW,
        timezone: 'UTC',
      }),
    ).toEqual({ error: 'invalid_local_date_time', ok: false });
    expect(
      resolveScheduledBlastDueTime({
        localDateTime: '2026-08-25T24:00',
        now: FIXED_NOW,
        timezone: 'UTC',
      }),
    ).toEqual({ error: 'invalid_local_date_time', ok: false });
  });

  it('rejects a DST spring-forward gap instead of inventing a time', () => {
    expect(
      resolveScheduledBlastDueTime({
        localDateTime: '2026-03-08T02:30',
        now: new Date('2026-03-01T12:00:00.000Z'),
        timezone: 'America/New_York',
      }),
    ).toEqual({ error: 'dst_gap', ok: false });
  });

  it('disambiguates a DST fall-back overlap to the earlier occurrence', () => {
    const resolved = resolveScheduledBlastDueTime({
      localDateTime: '2026-11-01T01:30',
      now: new Date('2026-10-15T12:00:00.000Z'),
      timezone: 'America/New_York',
    });

    expect(resolved).toEqual({
      ok: true,
      value: {
        dueAt: new Date('2026-11-01T05:30:00.000Z'),
        localDateTime: '2026-11-01T01:30',
        timezone: 'America/New_York',
      },
    });
  });

  it('rejects a due instant that is not strictly in the future', () => {
    expect(
      resolveScheduledBlastDueTime({
        localDateTime: '2026-08-24T08:00',
        now: FIXED_NOW,
        timezone: 'America/New_York',
      }),
    ).toEqual({ error: 'not_in_the_future', ok: false });
    expect(
      resolveScheduledBlastDueTime({
        localDateTime: '2026-08-24T12:00',
        now: FIXED_NOW,
        timezone: 'UTC',
      }),
    ).toEqual({ error: 'not_in_the_future', ok: false });
  });
});

describe('toScheduledBlastLocalDateTime', () => {
  it('pads to the datetime-local wire shape', () => {
    expect(
      toScheduledBlastLocalDateTime({
        day: 5,
        hour: 9,
        minute: 7,
        month: 1,
        year: 2026,
      }),
    ).toBe('2026-01-05T09:07');
  });
});
