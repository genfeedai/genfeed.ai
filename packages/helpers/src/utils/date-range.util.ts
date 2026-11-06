const DAY_MS = 86_400_000;

type DateRangeInput = {
  endDate?: Date | string | null;
  startDate?: Date | string | null;
};

export function formatApiDate(date: Date | string): string {
  const parsed = new Date(date);
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatUtcChipDate(date: Date, withYear: boolean): string {
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export function formatOptionalApiDate(
  date?: Date | string | null,
): string | null {
  return date ? formatApiDate(date) : null;
}

export function getDateRangeKeys(dateRange: DateRangeInput): {
  endDateKey: string | null;
  startDateKey: string | null;
} {
  return {
    endDateKey: formatOptionalApiDate(dateRange.endDate),
    startDateKey: formatOptionalApiDate(dateRange.startDate),
  };
}

/**
 * The `days` UTC days ending yesterday, each at UTC midnight. The API reads days
 * by their UTC date, so the range is counted in UTC days: counting in local days
 * across a daylight-saving change would add or drop a UTC day.
 */
export function getTrailingUtcDays(
  days: number,
  now: Date = new Date(),
): { endDate: Date; startDate: Date } {
  const endTime = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1,
  );

  return {
    endDate: new Date(endTime),
    startDate: new Date(endTime - (days - 1) * DAY_MS),
  };
}

export function getDefaultDateRange(): { startDate: string; endDate: string } {
  const { endDate, startDate } = getTrailingUtcDays(7);

  return {
    endDate: formatApiDate(endDate),
    startDate: formatApiDate(startDate),
  };
}

export function getDateRangeWithDefaults(
  startDate?: string | Date,
  endDate?: string | Date,
): { startDate: string; endDate: string } {
  const defaults = getDefaultDateRange();

  const formattedStartDate = startDate
    ? formatApiDate(startDate)
    : defaults.startDate;

  const formattedEndDate = endDate ? formatApiDate(endDate) : defaults.endDate;

  return {
    endDate: formattedEndDate,
    startDate: formattedStartDate,
  };
}

/** True for an integer millisecond timestamp inside the range `Date` can represent. */
export function isValidTimestampMs(value: number): boolean {
  return Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15;
}
