import { DateTime } from 'luxon';

/**
 * Utility for converting dates between timezones.
 * All dates in the database are stored in UTC.
 */
export class TimezoneUtil {
  /**
   * Convert a date from a specific timezone to UTC for database storage.
   * @param date - Date in user's timezone
   * @param timezone - IANA timezone (e.g., 'America/New_York')
   */
  static convertToUTC(date: Date, timezone: string): Date {
    if (!date || !timezone || timezone === 'UTC') {
      return date;
    }

    try {
      const dt = DateTime.fromJSDate(date, { zone: timezone });
      return dt.toUTC().toJSDate();
    } catch {
      // Silently return original date on conversion failure
      return date;
    }
  }

  /**
   * Convert a UTC date from database to user's timezone for display.
   * @param date - Date in UTC from database
   * @param timezone - IANA timezone (e.g., 'America/New_York')
   */
  static convertFromUTC(date: Date, timezone: string): Date {
    if (!date || !timezone || timezone === 'UTC') {
      return date;
    }

    try {
      const dt = DateTime.fromJSDate(date, { zone: 'UTC' });
      return dt.setZone(timezone).toJSDate();
    } catch {
      // Silently return original date on conversion failure
      return date;
    }
  }

  /**
   * Validate IANA timezone string.
   */
  static isValidTimezone(timezone: string): boolean {
    if (!timezone) {
      return false;
    }

    try {
      return DateTime.now().setZone(timezone).isValid;
    } catch {
      return false;
    }
  }

  /**
   * Get current time in specified timezone.
   */
  static now(timezone: string = 'UTC'): Date {
    try {
      return DateTime.now().setZone(timezone).toJSDate();
    } catch {
      // Silently return current UTC time on failure
      return new Date();
    }
  }
}
