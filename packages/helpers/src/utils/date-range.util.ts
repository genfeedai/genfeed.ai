import { format, subDays } from 'date-fns';

const API_DATE_FORMAT = 'yyyy-MM-dd';

type DateRangeInput = {
  endDate?: Date | string | null;
  startDate?: Date | string | null;
};

export function formatApiDate(date: Date | string): string {
  return format(new Date(date), API_DATE_FORMAT);
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
