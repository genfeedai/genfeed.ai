import { describe, expect, it } from 'vitest';
import {
  formatFullDate,
  formatShortDate,
  toValidDate,
} from './short-date.helper';

const NOW = new Date('2026-11-23T12:00:00Z');

describe('formatShortDate', () => {
  it('shows the date and time, without the year, in the current year', () => {
    expect(
      formatShortDate('2026-10-25T22:41:00Z', { timeZone: 'UTC' }, NOW),
    ).toBe('Oct 25, 10:41 PM');
  });

  it('shows the year instead of the time for another year', () => {
    expect(
      formatShortDate('2025-03-04T08:00:00Z', { timeZone: 'UTC' }, NOW),
    ).toBe('Mar 4, 2025');
  });

  it('leaves the time out of a day-precision value', () => {
    expect(
      formatShortDate(
        '2026-10-25T22:41:00Z',
        { hasTime: false, timeZone: 'UTC' },
        NOW,
      ),
    ).toBe('Oct 25');
  });

  it('shows the instant in the zone it is given', () => {
    expect(
      formatShortDate('2026-10-25T22:41:00Z', { timeZone: 'Asia/Tokyo' }, NOW),
    ).toBe('Oct 26, 7:41 AM');
  });

  it.each([null, undefined, '', 'not a date'])('is empty for %s', (value) => {
    expect(formatShortDate(value, { timeZone: 'UTC' }, NOW)).toBe('');
  });
});

describe('formatFullDate', () => {
  it('spells out the date and time', () => {
    expect(formatFullDate('2026-10-25T22:41:00Z', { timeZone: 'UTC' })).toBe(
      'Sunday, October 25, 2026 at 10:41 PM',
    );
  });

  it('leaves the time out when asked', () => {
    expect(
      formatFullDate('2026-10-25T22:41:00Z', {
        hasTime: false,
        timeZone: 'UTC',
      }),
    ).toBe('Sunday, October 25, 2026');
  });
});

describe('toValidDate', () => {
  it('returns a date for a timestamp, a string and a Date, and null for the rest', () => {
    expect(toValidDate(0)?.getTime()).toBe(0);
    expect(toValidDate('2026-10-25T22:41:00Z')).toBeInstanceOf(Date);
    expect(toValidDate(NOW)).toBe(NOW);
    expect(toValidDate('nope')).toBeNull();
    expect(toValidDate(null)).toBeNull();
  });
});
