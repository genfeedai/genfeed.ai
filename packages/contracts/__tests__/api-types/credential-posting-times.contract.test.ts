import { describe, expect, it } from 'vitest';
import {
  buildDayViewRows,
  findNextFreeSlot,
  formatClockTime,
  instantForClockTime,
  normalizePostingTimes,
  parseClockTime,
} from '../../src/api-types/contracts/credential-posting-times.contract';

describe('normalizePostingTimes', () => {
  it('dedupes, sorts, and drops invalid entries', () => {
    expect(
      normalizePostingTimes([
        { hour: 18, minute: 0 },
        { hour: 9, minute: 0 },
        { hour: 9, minute: 0 },
        { hour: 25, minute: 0 },
        '09:00',
      ]),
    ).toEqual([
      { hour: 9, minute: 0 },
      { hour: 18, minute: 0 },
    ]);
  });

  it('treats a missing list as empty', () => {
    expect(normalizePostingTimes(undefined)).toEqual([]);
    expect(normalizePostingTimes(null)).toEqual([]);
  });
});

describe('parseClockTime', () => {
  it('parses HH:mm values', () => {
    expect(parseClockTime('09:00')).toEqual({ hour: 9, minute: 0 });
    expect(parseClockTime('18:30')).toEqual({ hour: 18, minute: 30 });
    expect(parseClockTime('not-a-time')).toBeNull();
  });

  it('formats clock times as HH:mm', () => {
    expect(formatClockTime({ hour: 9, minute: 0 })).toBe('09:00');
  });
});

describe('buildDayViewRows', () => {
  it('shows preferred times when the day has no posts', () => {
    expect(
      buildDayViewRows({
        date: new Date('2026-08-24T12:00:00.000Z'),
        occupiedInstants: [],
        preferredTimes: [
          { hour: 18, minute: 0 },
          { hour: 9, minute: 0 },
        ],
        timezone: 'UTC',
      }),
    ).toEqual([
      { hour: 9, minute: 0 },
      { hour: 18, minute: 0 },
    ]);
  });

  it('adds occupied instants on the visible day and ignores other days', () => {
    expect(
      buildDayViewRows({
        date: new Date('2026-08-24T12:00:00.000Z'),
        occupiedInstants: [
          '2026-08-24T13:07:00.000Z',
          '2026-08-25T09:00:00.000Z',
        ],
        preferredTimes: [{ hour: 9, minute: 0 }],
        timezone: 'UTC',
      }),
    ).toEqual([
      { hour: 9, minute: 0 },
      { hour: 13, minute: 7 },
    ]);
  });

  it('resolves occupied instants in the brand timezone', () => {
    expect(
      buildDayViewRows({
        date: new Date('2026-08-24T07:00:00.000Z'),
        occupiedInstants: ['2026-08-24T08:00:00.000Z'],
        preferredTimes: [{ hour: 9, minute: 0 }],
        timezone: 'Europe/Malta',
      }).map(formatClockTime),
    ).toEqual(['09:00', '10:00']);
  });
});

describe('findNextFreeSlot', () => {
  it('returns not-found when the credential has no preferred times', () => {
    expect(
      findNextFreeSlot({
        after: new Date('2026-08-24T08:00:00.000Z'),
        occupiedInstants: [],
        preferredTimes: [],
        timezone: 'UTC',
      }),
    ).toEqual({ found: false });
  });

  it('returns the later preferred time after the earlier one is filled', () => {
    expect(
      findNextFreeSlot({
        after: new Date('2026-08-24T08:00:00.000Z'),
        occupiedInstants: ['2026-08-24T09:00:00.000Z'],
        preferredTimes: [
          { hour: 9, minute: 0 },
          { hour: 18, minute: 0 },
        ],
        timezone: 'UTC',
      }),
    ).toEqual({
      found: true,
      hour: 18,
      instant: '2026-08-24T18:00:00.000Z',
      minute: 0,
      timezone: 'UTC',
    });
  });

  it('skips a preferred time that has already passed', () => {
    expect(
      findNextFreeSlot({
        after: new Date('2026-08-24T10:00:00.000Z'),
        occupiedInstants: [],
        preferredTimes: [
          { hour: 9, minute: 0 },
          { hour: 18, minute: 0 },
        ],
        timezone: 'UTC',
      }),
    ).toEqual({
      found: true,
      hour: 18,
      instant: '2026-08-24T18:00:00.000Z',
      minute: 0,
      timezone: 'UTC',
    });
  });

  it('rolls to the next day when every remaining time today is occupied', () => {
    expect(
      findNextFreeSlot({
        after: new Date('2026-08-24T08:00:00.000Z'),
        occupiedInstants: [
          '2026-08-24T09:00:00.000Z',
          '2026-08-24T18:00:00.000Z',
        ],
        preferredTimes: [
          { hour: 9, minute: 0 },
          { hour: 18, minute: 0 },
        ],
        timezone: 'UTC',
      }),
    ).toEqual({
      found: true,
      hour: 9,
      instant: '2026-08-25T09:00:00.000Z',
      minute: 0,
      timezone: 'UTC',
    });
  });

  it('resolves the next slot in the brand timezone', () => {
    const slot = findNextFreeSlot({
      after: new Date('2026-08-24T06:00:00.000Z'),
      occupiedInstants: [],
      preferredTimes: [{ hour: 9, minute: 0 }],
      timezone: 'Europe/Malta',
    });

    expect(slot.found).toBe(true);
    if (!slot.found) {
      return;
    }
    expect(slot.hour).toBe(9);
    expect(slot.timezone).toBe('Europe/Malta');
    expect(
      new Date(slot.instant).toLocaleString('en-GB', {
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        timeZone: 'Europe/Malta',
      }),
    ).toBe('09:00');
  });
});

describe('instantForClockTime', () => {
  it('builds a brand-timezone instant on the visible day', () => {
    const instant = instantForClockTime({
      date: new Date('2026-08-24T12:00:00.000Z'),
      time: { hour: 9, minute: 0 },
      timezone: 'UTC',
    });

    expect(instant?.toISOString()).toBe('2026-08-24T09:00:00.000Z');
  });
});
