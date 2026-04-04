import {
  DATE_FORMATS,
  formatDate,
  getEndOfDay,
  getStartOfDay,
  isValidDate,
  toApiFormat,
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

  describe('toApiFormat', () => {
    it('formats date to API format', () => {
      const date = new Date(2025, 0, 15, 10, 30, 45, 123);
      const result = toApiFormat(date);
      expect(result).toBe('2025-01-15T10:30:45.123Z');
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

  describe('getStartOfDay', () => {
    it('returns start of day for Date object', () => {
      const date = new Date(2025, 0, 15, 14, 30, 45);
      const result = getStartOfDay(date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('returns start of day for ISO string', () => {
      const result = getStartOfDay('2025-06-15');
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });

    it('returns start of day for timestamp', () => {
      const timestamp = new Date(2025, 3, 10, 18, 0).getTime();
      const result = getStartOfDay(timestamp);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });
  });

  describe('getEndOfDay', () => {
    it('returns end of day for Date object', () => {
      const date = new Date(2025, 0, 15, 14, 30, 45);
      const result = getEndOfDay(date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
    });

    it('returns end of day for ISO string', () => {
      const result = getEndOfDay('2025-06-15');
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
    });

    it('returns end of day for timestamp', () => {
      const timestamp = new Date(2025, 3, 10, 6, 0).getTime();
      const result = getEndOfDay(timestamp);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
    });
  });
});
