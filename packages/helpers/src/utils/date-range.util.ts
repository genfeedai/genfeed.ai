import { subDays } from 'date-fns';

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

export function getDefaultDateRange(): { startDate: string; endDate: string } {
  const yesterday = subDays(new Date(), 1);
  const sevenDaysAgo = subDays(yesterday, 6);

  return {
    endDate: formatApiDate(yesterday),
    startDate: formatApiDate(sevenDaysAgo),
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
