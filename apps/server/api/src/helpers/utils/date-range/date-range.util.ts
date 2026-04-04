/**
 * Date range utility for analytics queries
 * Provides default values and parsing for startDate/endDate parameters
 */

export interface DateRange {
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
}

export interface DateRangeOptions {
  /**
   * Number of days before endDate for default startDate
   * @default 7 (D-7)
   */
  defaultDays?: number;
  /**
   * Whether to calculate previous period for growth comparison
   * @default true
   */
  includePreviousPeriod?: boolean;
}

/**
 * Parse date range with validation and defaults
 * - startDate: beginning of day (00:00:00.000), defaults to D-7
 * - endDate: end of day (23:59:59.999), defaults to D-1 (yesterday)
 * - Calculates previous period for growth comparison if requested
 *
 * @param startDateInput - Optional start date (Date, string, or undefined)
 * @param endDateInput - Optional end date (Date, string, or undefined)
 * @param options - Configuration options
 * @returns DateRange object with startDate, endDate, and optional previous period dates
 *
 * @example
 * // Use defaults (D-7 to D-1)
 * const range = DateRangeUtil.parseDateRange();
 *
 * @example
 * // Custom dates
 * const range = DateRangeUtil.parseDateRange('2024-01-01', '2024-01-31');
 *
 * @example
 * // Without previous period calculation
 * const range = DateRangeUtil.parseDateRange(undefined, undefined, {
 *   includePreviousPeriod: false
 * });
 */
export class DateRangeUtil {
  /**
   * Default number of days for startDate (7 days ago)
   */
  private static readonly DEFAULT_DAYS = 7;

  /**
   * Parse date range with validation and defaults
   */
  static parseDateRange(
    startDateInput?: Date | string,
    endDateInput?: Date | string,
    options: DateRangeOptions = {},
  ): DateRange {
    const {
      defaultDays = DateRangeUtil.DEFAULT_DAYS,
      includePreviousPeriod = true,
    } = options;

    // Get yesterday as max endDate (today's data incomplete)
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(23, 59, 59, 999);

    // Parse endDate (default to yesterday)
    let endDate: Date;
    if (endDateInput) {
      endDate = new Date(endDateInput);
      endDate.setUTCHours(23, 59, 59, 999);

      // Enforce max = yesterday
      if (endDate > yesterday) {
        endDate = yesterday;
      }
    } else {
      endDate = yesterday;
    }

    // Parse startDate (default to D-7 before endDate)
    let startDate: Date;
    if (startDateInput) {
      startDate = new Date(startDateInput);
      startDate.setUTCHours(0, 0, 0, 0);
    } else {
      startDate = new Date(endDate);
      // Subtract (defaultDays - 1) to get D-7 from D-1 (inclusive range)
      // e.g., D-1 to D-7 is 7 days inclusive, so subtract 6 days
      startDate.setUTCDate(startDate.getUTCDate() - (defaultDays - 1));
      startDate.setUTCHours(0, 0, 0, 0);
    }

    // Validate: startDate must be before endDate (check same calendar day)
    if (startDate >= endDate) {
      throw new Error('startDate must be before endDate');
    }
    // Also check if dates are on the same calendar day
    if (
      startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
      startDate.getUTCMonth() === endDate.getUTCMonth() &&
      startDate.getUTCDate() === endDate.getUTCDate()
    ) {
      throw new Error('startDate must be before endDate');
    }

    // Calculate previous period (same duration, immediately before startDate)
    let previousStartDate: Date;
    let previousEndDate: Date;

    if (includePreviousPeriod) {
      const durationDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      previousEndDate = new Date(startDate);
      previousEndDate.setMilliseconds(previousEndDate.getMilliseconds() - 1);

      previousStartDate = new Date(previousEndDate);
      // Subtract (durationDays - 1) to match current window length (inclusive range)
      // e.g., 7-day range should produce 7-day previous period
      previousStartDate.setUTCDate(
        previousStartDate.getUTCDate() - (durationDays - 1),
      );
      previousStartDate.setUTCHours(0, 0, 0, 0);
    } else {
      // Return same dates if previous period not needed
      previousStartDate = startDate;
      previousEndDate = endDate;
    }

    return {
      endDate,
      previousEndDate,
      previousStartDate,
      startDate,
    };
  }

  /**
   * Get default date range (D-7 to D-1)
   * Convenience method for getting defaults without parsing
   */
  static getDefaultDateRange(): DateRange {
    return DateRangeUtil.parseDateRange();
  }
}
