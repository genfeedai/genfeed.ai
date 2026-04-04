import {
  convertFromUTC,
  convertToUTC,
  createDateFromTimezone,
  formatDateInTimezone,
  getBrowserTimezone,
  isValidTimezone,
  TIMEZONES,
} from '@helpers/formatting/timezone/timezone.helper';
import { describe, expect, it } from 'vitest';

describe('TIMEZONES', () => {
  it('contains UTC with offset 0', () => {
    const utc = TIMEZONES.find((t) => t.value === 'UTC');
    expect(utc).toBeDefined();
    expect(utc?.offset).toBe(0);
  });

  it('contains expected major timezones', () => {
    const values = TIMEZONES.map((t) => t.value);
    expect(values).toContain('America/New_York');
    expect(values).toContain('Europe/London');
    expect(values).toContain('Asia/Tokyo');
  });

  it('every entry has label, offset, and value', () => {
    for (const tz of TIMEZONES) {
      expect(typeof tz.label).toBe('string');
      expect(typeof tz.offset).toBe('number');
      expect(typeof tz.value).toBe('string');
    }
  });
});

describe('isValidTimezone', () => {
  it('returns true for valid IANA timezone strings', () => {
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('Europe/London')).toBe(true);
    expect(isValidTimezone('Asia/Tokyo')).toBe(true);
  });

  it('returns false for invalid timezone strings', () => {
    expect(isValidTimezone('Fake/Zone')).toBe(false);
    expect(isValidTimezone('not-a-timezone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});

describe('getBrowserTimezone', () => {
  it('returns a non-empty string', () => {
    const tz = getBrowserTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });

  it('returns a valid IANA timezone', () => {
    expect(isValidTimezone(getBrowserTimezone())).toBe(true);
  });
});

describe('convertToUTC', () => {
  it('returns the same instant when timezone is UTC', () => {
    const date = new Date('2024-06-15T12:00:00Z');
    const result = convertToUTC(date, 'UTC');
    // UTC → UTC means the numeric time is unchanged
    expect(result.getUTCHours()).toBe(12);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it('returns a Date object', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    expect(convertToUTC(date, 'America/New_York')).toBeInstanceOf(Date);
  });

  it('defaults to UTC when no timezone supplied', () => {
    const date = new Date('2024-03-10T15:30:00Z');
    const result = convertToUTC(date);
    expect(result).toBeInstanceOf(Date);
  });
});

describe('convertFromUTC', () => {
  it('returns the same date object when timezone is UTC', () => {
    const date = new Date('2024-06-15T12:00:00Z');
    const result = convertFromUTC(date, 'UTC');
    expect(result.getTime()).toBe(date.getTime());
  });

  it('returns a Date for a non-UTC timezone', () => {
    const date = new Date('2024-06-15T12:00:00Z');
    const result = convertFromUTC(date, 'America/New_York');
    expect(result).toBeInstanceOf(Date);
  });
});

describe('formatDateInTimezone', () => {
  it('returns a non-empty string', () => {
    const result = formatDateInTimezone(
      new Date('2024-06-15T12:00:00Z'),
      'UTC',
    );
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts a string date input', () => {
    const result = formatDateInTimezone('2024-01-01T00:00:00Z', 'UTC');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('uses short format when format is "short"', () => {
    const result = formatDateInTimezone(
      new Date('2024-06-15T12:00:00Z'),
      'UTC',
      'short',
    );
    expect(typeof result).toBe('string');
  });
});

describe('createDateFromTimezone', () => {
  it('creates a UTC date when timezone is UTC', () => {
    const result = createDateFromTimezone(2024, 6, 15, 12, 0, 'UTC');
    expect(result.getUTCFullYear()).toBe(2024);
    expect(result.getUTCMonth()).toBe(5); // 0-indexed
    expect(result.getUTCDate()).toBe(15);
    expect(result.getUTCHours()).toBe(12);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it('returns a Date instance for any valid timezone', () => {
    const result = createDateFromTimezone(2024, 1, 1, 9, 0, 'Asia/Tokyo');
    expect(result).toBeInstanceOf(Date);
  });
});
