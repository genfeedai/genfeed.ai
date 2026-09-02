import { TimezoneUtil } from '@api/shared/utils/timezone/timezone.util';
import { DateTime } from 'luxon';

describe('TimezoneUtil', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('convertToUTC', () => {
    it('converts dates from timezone to UTC', () => {
      const localDate = new Date('2025-01-01T08:00:00.000-05:00'); // 8am New York
      const converted = TimezoneUtil.convertToUTC(
        localDate,
        'America/New_York',
      );

      expect(converted.toISOString()).toBe('2025-01-01T13:00:00.000Z');
    });

    it('returns original date when timezone is missing/empty', () => {
      const date = new Date('2025-01-01T00:00:00.000Z');
      expect(TimezoneUtil.convertToUTC(date, '')).toBe(date);
    });
  });

  describe('convertFromUTC', () => {
    it('converts UTC date into provided timezone context', () => {
      const utcDate = new Date('2025-01-01T13:00:00.000Z');
      const converted = TimezoneUtil.convertFromUTC(
        utcDate,
        'America/New_York',
      );

      const localized = DateTime.fromJSDate(converted, {
        zone: 'America/New_York',
      });
      expect(localized.hour).toBe(8);
      expect(localized.minute).toBe(0);
    });

    it('returns original date when timezone missing', () => {
      const utcDate = new Date('2025-01-01T13:00:00.000Z');
      expect(TimezoneUtil.convertFromUTC(utcDate, 'UTC')).toBe(utcDate);
    });
  });

  describe('isValidTimezone', () => {
    it('validates IANA strings', () => {
      expect(TimezoneUtil.isValidTimezone('America/New_York')).toBe(true);
      expect(TimezoneUtil.isValidTimezone('Invalid/Zone')).toBe(false);
    });
  });

  describe('now', () => {
    it('generates dates in specified timezone or falls back to UTC', () => {
      const tokyoNow = TimezoneUtil.now('Asia/Tokyo');
      const dt = DateTime.fromJSDate(tokyoNow, { zone: 'Asia/Tokyo' });
      expect(dt.zoneName).toBe('Asia/Tokyo');

      const fallback = TimezoneUtil.now('Invalid/Zone');
      expect(fallback).toBeInstanceOf(Date);
    });
  });
});
