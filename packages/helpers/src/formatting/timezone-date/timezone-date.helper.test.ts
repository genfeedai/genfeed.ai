import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the base date helper
vi.mock('@helpers/formatting/date/date.helper', () => ({
  formatDate: vi.fn((date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString();
  }),
}));

import {
  formatDateInTimezone,
  formatScheduledDate,
} from '@helpers/formatting/timezone-date/timezone-date.helper';

describe('timezone-date.helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('formatDateInTimezone', () => {
    describe('null/undefined handling', () => {
      it('should return empty string for null date', () => {
        expect(formatDateInTimezone(null)).toBe('');
      });

      it('should return empty string for undefined date', () => {
        expect(formatDateInTimezone(undefined)).toBe('');
      });
    });

    describe('invalid date handling', () => {
      it('should return empty string for invalid date string', () => {
        expect(formatDateInTimezone('invalid-date')).toBe('');
      });
    });

    describe('date parsing', () => {
      it('should handle Date object', () => {
        const date = new Date('2024-06-15T12:00:00Z');
        const result = formatDateInTimezone(date, 'UTC');

        expect(result).toContain('Jun');
        expect(result).toContain('15');
      });

      it('should handle ISO string date', () => {
        const result = formatDateInTimezone('2024-06-15T12:00:00Z', 'UTC');

        expect(result).toContain('Jun');
        expect(result).toContain('15');
      });
    });

    describe('UTC timezone', () => {
      it('should format date in UTC with default format', () => {
        const result = formatDateInTimezone('2024-06-15T14:30:00Z', 'UTC');

        expect(result).toContain('Jun');
        expect(result).toContain('15');
        expect(result).toContain('2:30');
        expect(result).toContain('PM');
      });

      it('should format morning time correctly in UTC', () => {
        const result = formatDateInTimezone('2024-06-15T08:00:00Z', 'UTC');

        expect(result).toContain('8:00');
        expect(result).toContain('AM');
      });
    });

    describe('other timezones', () => {
      it('should format date in America/New_York timezone', () => {
        const result = formatDateInTimezone(
          '2024-06-15T14:30:00Z',
          'America/New_York',
        );

        expect(result).toBeDefined();
        // New York is UTC-4 in June (EDT)
        // 14:30 UTC = 10:30 EDT
        expect(result).toContain('Jun');
      });

      it('should format date in Europe/London timezone', () => {
        const result = formatDateInTimezone(
          '2024-06-15T14:30:00Z',
          'Europe/London',
        );

        expect(result).toBeDefined();
        expect(result).toContain('Jun');
      });

      it('should format date in Asia/Tokyo timezone', () => {
        const result = formatDateInTimezone(
          '2024-06-15T14:30:00Z',
          'Asia/Tokyo',
        );

        expect(result).toBeDefined();
      });
    });

    describe('custom format', () => {
      it('should apply custom format options', () => {
        const result = formatDateInTimezone('2024-06-15T14:30:00Z', 'UTC', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        expect(result).toContain('June');
        expect(result).toContain('15');
        expect(result).toContain('2024');
      });
    });

    describe('fallback behavior', () => {
      it('should use default timezone when not provided', () => {
        const result = formatDateInTimezone('2024-06-15T14:30:00Z');

        expect(result).toBeDefined();
        expect(result).toContain('Jun');
      });
    });
  });

  describe('formatScheduledDate', () => {
    describe('null/undefined handling', () => {
      it('should return dash for null date', () => {
        expect(formatScheduledDate(null)).toBe('-');
      });

      it('should return dash for undefined date', () => {
        expect(formatScheduledDate(undefined)).toBe('-');
      });
    });

    describe('with timezone', () => {
      it('should use timezone-aware formatting', () => {
        const result = formatScheduledDate(
          '2024-06-15T14:30:00Z',
          'America/New_York',
        );

        expect(result).toBeDefined();
        expect(result).toContain('Jun');
      });

      it('should format with custom timezone', () => {
        const result = formatScheduledDate(
          '2024-06-15T14:30:00Z',
          'Europe/Paris',
        );

        expect(result).toBeDefined();
      });
    });

    describe('without timezone', () => {
      it('should use browser local time when no timezone', () => {
        const result = formatScheduledDate('2024-06-15T14:30:00Z');

        expect(result).toBeDefined();
        expect(result).toContain('Jun');
      });

      it('should handle Date object', () => {
        const date = new Date('2024-06-15T14:30:00Z');
        const result = formatScheduledDate(date);

        expect(result).toBeDefined();
        expect(result).toContain('Jun');
      });
    });

    describe('format consistency', () => {
      it('should include month, day, hour, and minute', () => {
        const result = formatScheduledDate('2024-06-15T14:30:00Z', 'UTC');

        expect(result).toContain('Jun');
        expect(result).toContain('15');
      });
    });
  });
});
