import {
  capitalize,
  formatChartDate,
  formatCompactNumber,
  formatCompactNumberIntl,
  formatFullNumber,
  formatHour,
  formatNumberWithCommas,
  formatPercentage,
  formatPercentageSimple,
  formatTooltipDateTime,
} from '@helpers/formatting/format/format.helper';
import { describe, expect, it } from 'vitest';

describe('format.helper', () => {
  describe('formatCompactNumber', () => {
    it('returns "0" for null and undefined', () => {
      expect(formatCompactNumber(null)).toBe('0');
      expect(formatCompactNumber(undefined)).toBe('0');
    });

    it('returns "0" for NaN string input', () => {
      expect(formatCompactNumber('abc')).toBe('0');
    });

    it('returns number as string for values below 1000', () => {
      expect(formatCompactNumber(0)).toBe('0');
      expect(formatCompactNumber(1)).toBe('1');
      expect(formatCompactNumber(999)).toBe('999');
    });

    it('formats thousands with k suffix', () => {
      expect(formatCompactNumber(1000)).toBe('1.0k');
      expect(formatCompactNumber(1500)).toBe('1.5k');
      expect(formatCompactNumber(999999)).toBe('1000.0k');
    });

    it('formats millions with M suffix', () => {
      expect(formatCompactNumber(1000000)).toBe('1.0M');
      expect(formatCompactNumber(2500000)).toBe('2.5M');
      expect(formatCompactNumber(10000000)).toBe('10.0M');
    });

    it('handles string inputs', () => {
      expect(formatCompactNumber('1500')).toBe('1.5k');
      expect(formatCompactNumber('2000000')).toBe('2.0M');
      expect(formatCompactNumber('42')).toBe('42');
    });
  });

  describe('formatNumberWithCommas', () => {
    it('returns "0" for null and undefined', () => {
      expect(formatNumberWithCommas(null)).toBe('0');
      expect(formatNumberWithCommas(undefined)).toBe('0');
    });

    it('returns "0" for NaN string input', () => {
      expect(formatNumberWithCommas('not-a-number')).toBe('0');
    });

    it('formats numbers with commas', () => {
      expect(formatNumberWithCommas(1000)).toBe('1,000');
      expect(formatNumberWithCommas(1000000)).toBe('1,000,000');
      expect(formatNumberWithCommas(123456789)).toBe('123,456,789');
    });

    it('returns small numbers without commas', () => {
      expect(formatNumberWithCommas(0)).toBe('0');
      expect(formatNumberWithCommas(999)).toBe('999');
    });

    it('handles string inputs', () => {
      expect(formatNumberWithCommas('5000')).toBe('5,000');
    });
  });

  describe('capitalize', () => {
    it('returns empty string for null and undefined', () => {
      expect(capitalize(null)).toBe('');
      expect(capitalize(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(capitalize('')).toBe('');
    });

    it('capitalizes first letter and lowercases rest', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('HELLO')).toBe('Hello');
      expect(capitalize('hELLO')).toBe('Hello');
    });

    it('handles single character', () => {
      expect(capitalize('a')).toBe('A');
    });
  });

  describe('formatCompactNumberIntl', () => {
    it('returns "0" for null and undefined', () => {
      expect(formatCompactNumberIntl(null)).toBe('0');
      expect(formatCompactNumberIntl(undefined)).toBe('0');
    });

    it('formats thousands with K', () => {
      expect(formatCompactNumberIntl(1000)).toBe('1K');
      expect(formatCompactNumberIntl(1500)).toBe('1.5K');
    });

    it('formats millions with M', () => {
      expect(formatCompactNumberIntl(1000000)).toBe('1M');
      expect(formatCompactNumberIntl(2500000)).toBe('2.5M');
    });

    it('returns small numbers as-is', () => {
      expect(formatCompactNumberIntl(42)).toBe('42');
      expect(formatCompactNumberIntl(0)).toBe('0');
    });
  });

  describe('formatFullNumber', () => {
    it('returns "0" for null and undefined', () => {
      expect(formatFullNumber(null)).toBe('0');
      expect(formatFullNumber(undefined)).toBe('0');
    });

    it('formats large numbers with commas', () => {
      expect(formatFullNumber(1234567)).toBe('1,234,567');
    });

    it('returns small numbers as-is', () => {
      expect(formatFullNumber(42)).toBe('42');
    });
  });

  describe('formatPercentage', () => {
    it('returns "0%" for null and undefined', () => {
      expect(formatPercentage(null)).toBe('0%');
      expect(formatPercentage(undefined)).toBe('0%');
    });

    it('shows + sign for positive values by default', () => {
      expect(formatPercentage(12.5)).toBe('+12.5%');
      expect(formatPercentage(0)).toBe('+0.0%');
    });

    it('shows - sign for negative values', () => {
      expect(formatPercentage(-3.2)).toBe('-3.2%');
    });

    it('hides + sign when showSign is false', () => {
      expect(formatPercentage(12.5, { showSign: false })).toBe('12.5%');
    });

    it('respects custom decimals', () => {
      expect(formatPercentage(12.567, { decimals: 2 })).toBe('+12.57%');
      expect(formatPercentage(12.567, { decimals: 0 })).toBe('+13%');
    });
  });

  describe('formatPercentageSimple', () => {
    it('returns "0%" for null and undefined', () => {
      expect(formatPercentageSimple(null)).toBe('0%');
      expect(formatPercentageSimple(undefined)).toBe('0%');
    });

    it('formats without sign', () => {
      expect(formatPercentageSimple(12.5)).toBe('12.5%');
      expect(formatPercentageSimple(-3.2)).toBe('-3.2%');
    });

    it('respects custom decimals', () => {
      expect(formatPercentageSimple(12.567, 2)).toBe('12.57%');
    });
  });

  describe('formatChartDate', () => {
    it('returns empty string for null and undefined', () => {
      expect(formatChartDate(null)).toBe('');
      expect(formatChartDate(undefined)).toBe('');
    });

    it('returns empty string for invalid date', () => {
      expect(formatChartDate('not-a-date')).toBe('');
    });

    it('formats Date object', () => {
      const date = new Date(2025, 0, 15); // Jan 15, 2025
      expect(formatChartDate(date)).toBe('Jan 15');
    });

    it('formats string date', () => {
      expect(formatChartDate('2025-06-01')).toMatch(/Jun\s+1/);
    });

    it('formats timestamp number', () => {
      const timestamp = new Date(2025, 11, 25).getTime(); // Dec 25, 2025
      expect(formatChartDate(timestamp)).toBe('Dec 25');
    });
  });

  describe('formatTooltipDateTime', () => {
    it('returns empty string for null and undefined', () => {
      expect(formatTooltipDateTime(null)).toBe('');
      expect(formatTooltipDateTime(undefined)).toBe('');
    });

    it('returns empty string for invalid date', () => {
      expect(formatTooltipDateTime('invalid')).toBe('');
    });

    it('formats date with time', () => {
      const date = new Date(2025, 0, 15, 15, 30); // Jan 15, 2025 3:30 PM
      const result = formatTooltipDateTime(date);
      expect(result).toContain('Jan');
      expect(result).toContain('15');
      expect(result).toMatch(/3:30\s*PM/);
    });
  });

  describe('formatHour', () => {
    it('formats AM hours', () => {
      expect(formatHour(0)).toBe('12AM');
      expect(formatHour(1)).toBe('1AM');
      expect(formatHour(11)).toBe('11AM');
    });

    it('formats PM hours', () => {
      expect(formatHour(12)).toBe('12PM');
      expect(formatHour(13)).toBe('1PM');
      expect(formatHour(23)).toBe('11PM');
    });
  });
});
