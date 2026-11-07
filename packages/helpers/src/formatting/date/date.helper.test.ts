import {
  DATE_FORMATS,
  formatDate,
  formatElapsedTime,
  getRelativeTime,
  isValidDate,
} from '@helpers/formatting/date/date.helper';
import { describe, expect, it } from 'vitest';

describe('date.helper', () => {
  describe('DATE_FORMATS', () => {
    it('contains expected format keys', () => {
      expect(DATE_FORMATS.SHORT_DATE).toBe('MM/dd/yyyy');
      expect(DATE_FORMATS.DISPLAY_DATE).toBe('MMM d, yyyy');
      expect(DATE_FORMATS.ISO_DATE).toBe('yyyy-MM-dd');
      expect(DATE_FORMATS.TIME_ONLY).toBe('HH:mm:ss');
    });
  });

  describe('formatDate', () => {
    it('returns empty string for null and undefined', () => {
      expect(formatDate(null)).toBe('');
      expect(formatDate(undefined)).toBe('');
    });

    it('returns empty string for falsy values', () => {
      expect(formatDate(0)).toBe('');
    });

    it('formats Date object with default SHORT_DATE format', () => {
      const date = new Date(2025, 0, 15); // Jan 15, 2025
      expect(formatDate(date)).toBe('01/15/2025');
    });

    it('formats string date', () => {
      expect(formatDate('2025-01-15')).toBe('01/15/2025');
    });

    it('formats with custom format', () => {
      const date = new Date(2025, 0, 15);
      expect(formatDate(date, DATE_FORMATS.DISPLAY_DATE)).toBe('Jan 15, 2025');
      expect(formatDate(date, DATE_FORMATS.ISO_DATE)).toBe('2025-01-15');
      expect(formatDate(date, DATE_FORMATS.LONG_DATE)).toBe('January 15, 2025');
    });

    it('formats timestamp number', () => {
      const timestamp = new Date(2025, 5, 1).getTime(); // Jun 1, 2025
      expect(formatDate(timestamp)).toBe('06/01/2025');
    });

    it('returns empty string for invalid date string', () => {
      expect(formatDate('not-a-date')).toBe('');
    });
  });

  describe('getRelativeTime', () => {
    it('returns empty string for invalid dates', () => {
      expect(getRelativeTime('not-a-date')).toBe('');
    });
  });

  describe('isValidDate', () => {
    it('returns true for valid Date object', () => {
      expect(isValidDate(new Date(2025, 0, 15))).toBe(true);
    });

    it('returns true for valid ISO string', () => {
      expect(isValidDate('2025-01-15')).toBe(true);
    });

    it('returns true for valid timestamp', () => {
      expect(isValidDate(Date.now())).toBe(true);
    });

    it('returns false for invalid date string', () => {
      expect(isValidDate('not-a-date')).toBe(false);
    });

    it('returns false for invalid Date object', () => {
      expect(isValidDate(new Date('invalid'))).toBe(false);
    });
  });

  describe('formatElapsedTime', () => {
    const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
    const minutesAgo = (minutes: number) => NOW - minutes * 60_000;

    it.each([
      [0.5, 'now', 'Just now'],
      [30, '30m', '30m ago'],
      [60 * 5, '5h', '5h ago'],
      [60 * 49, '2d', '2d ago'],
      [60 * 24 * 6, '6d', '6d ago'],
    ])(
      '%s minutes ago reads %j (compact) and %j (ago)',
      (minutes, compact, ago) => {
        expect(formatElapsedTime(minutesAgo(minutes), 'compact', NOW)).toBe(
          compact,
        );
        expect(formatElapsedTime(minutesAgo(minutes), 'ago', NOW)).toBe(ago);
      },
    );

    it('shows the date from seven days on', () => {
      expect(
        formatElapsedTime(
          new Date(2026, 9, 20, 12),
          'compact',
          new Date(2026, 10, 7, 12).getTime(),
        ),
      ).toBe('Oct 20');
    });

    it('adds the year for dates outside the current year', () => {
      expect(
        formatElapsedTime(
          new Date(2025, 11, 20, 12),
          'ago',
          new Date(2026, 0, 10, 12).getTime(),
        ),
      ).toBe('Dec 20, 2025');
    });

    it('treats future timestamps as now', () => {
      expect(formatElapsedTime(NOW + 60_000, 'compact', NOW)).toBe('now');
    });

    it.each([[null], [undefined], [''], ['not a date']])(
      'returns an empty string for %j',
      (value) => {
        expect(formatElapsedTime(value, 'ago', NOW)).toBe('');
      },
    );
  });
});
