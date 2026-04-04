import { format, subDays } from 'date-fns';

export function getDefaultDateRange(): { startDate: string; endDate: string } {
  const yesterday = subDays(new Date(), 1);
  const sevenDaysAgo = subDays(yesterday, 6);

  return {
    endDate: format(yesterday, 'yyyy-MM-dd'),
    startDate: format(sevenDaysAgo, 'yyyy-MM-dd'),
  };
}

export function getDateRangeWithDefaults(
  startDate?: string | Date,
  endDate?: string | Date,
): { startDate: string; endDate: string } {
  const defaults = getDefaultDateRange();
  const dateFormat = 'yyyy-MM-dd';

  const formattedStartDate = startDate
    ? format(new Date(startDate), dateFormat)
    : defaults.startDate;

  const formattedEndDate = endDate
    ? format(new Date(endDate), dateFormat)
    : defaults.endDate;

  return {
    endDate: formattedEndDate,
    startDate: formattedStartDate,
  };
}
