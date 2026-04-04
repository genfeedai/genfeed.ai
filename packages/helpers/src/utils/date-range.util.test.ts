import {
  getDateRangeWithDefaults,
  getDefaultDateRange,
} from '@helpers/utils/date-range.util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('date-range.util', () => {
  beforeEach(() => {
    // Use a fixed date for testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getDefaultDateRange', () => {
    it('should return startDate as 7 days ago from yesterday', () => {
      const { startDate } = getDefaultDateRange();

      // Today is June 15, yesterday is June 14
      // 7 days ago from yesterday (June 14 - 6 days) = June 8
      expect(startDate).toBe('2024-06-08');
    });

    it('should return endDate as yesterday', () => {
      const { endDate } = getDefaultDateRange();

      // Today is June 15, yesterday is June 14
      expect(endDate).toBe('2024-06-14');
    });

    it('should return dates in yyyy-MM-dd format', () => {
      const { startDate, endDate } = getDefaultDateRange();

      expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should have 7 day span', () => {
      const { startDate, endDate } = getDefaultDateRange();

      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffDays = Math.round(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );

      expect(diffDays).toBe(6); // 6 days difference = 7 day range (inclusive)
    });
  });

  describe('getDateRangeWithDefaults', () => {
    it('should use defaults when no dates provided', () => {
      const result = getDateRangeWithDefaults();
      const defaults = getDefaultDateRange();

      expect(result.startDate).toBe(defaults.startDate);
      expect(result.endDate).toBe(defaults.endDate);
    });

    it('should use provided startDate string', () => {
      const result = getDateRangeWithDefaults('2024-01-01');

      expect(result.startDate).toBe('2024-01-01');
    });

    it('should use provided endDate string', () => {
      const result = getDateRangeWithDefaults(undefined, '2024-12-31');

      expect(result.endDate).toBe('2024-12-31');
    });

    it('should use both provided dates', () => {
      const result = getDateRangeWithDefaults('2024-01-01', '2024-01-31');

      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-01-31');
    });

    it('should handle Date objects for startDate', () => {
      const result = getDateRangeWithDefaults(new Date('2024-03-15'));

      expect(result.startDate).toBe('2024-03-15');
    });

    it('should handle Date objects for endDate', () => {
      const result = getDateRangeWithDefaults(
        undefined,
        new Date('2024-03-20'),
      );

      expect(result.endDate).toBe('2024-03-20');
    });

    it('should format dates to yyyy-MM-dd', () => {
      const result = getDateRangeWithDefaults(
        new Date('2024-05-05T10:30:00Z'),
        new Date('2024-05-10T15:45:00Z'),
      );

      expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should use default startDate when only endDate provided', () => {
      const defaults = getDefaultDateRange();
      const result = getDateRangeWithDefaults(undefined, '2024-12-31');

      expect(result.startDate).toBe(defaults.startDate);
      expect(result.endDate).toBe('2024-12-31');
    });

    it('should use default endDate when only startDate provided', () => {
      const defaults = getDefaultDateRange();
      const result = getDateRangeWithDefaults('2024-01-01');

      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe(defaults.endDate);
    });
  });
});
