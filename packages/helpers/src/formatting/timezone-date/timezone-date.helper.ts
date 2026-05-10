import { formatDate as baseFormatDate } from '@helpers/formatting/date/date.helper';

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  hour: 'numeric',
  hour12: true,
  minute: '2-digit',
  month: 'short',
};

const timezoneDateFormatters = new Map<string, Intl.DateTimeFormat>();

function getTimezoneDateFormatter(
  timezone: string,
  format: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cacheKey = `${timezone}:${JSON.stringify(format)}`;
  const cached = timezoneDateFormatters.get(cacheKey);
  if (cached) {
    return cached;
  }

  const formatter = Intl.DateTimeFormat('en-US', {
    ...format,
    timeZone: timezone,
  });
  timezoneDateFormatters.set(cacheKey, formatter);
  return formatter;
}

export function formatDateInTimezone(
  date: Date | string | null | undefined,
  timezone: string = 'UTC',
  format: Intl.DateTimeFormatOptions = DEFAULT_DATE_FORMAT,
): string {
  if (!date) {
    return '';
  }

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    if (Number.isNaN(dateObj.getTime())) {
      return '';
    }

    return getTimezoneDateFormatter(timezone, format).format(dateObj);
  } catch (_error) {
    return baseFormatDate(date);
  }
}

export function formatScheduledDate(
  scheduledDate: Date | string | null | undefined,
  timezone?: string,
): string {
  if (!scheduledDate) {
    return '-';
  }

  if (timezone) {
    return formatDateInTimezone(scheduledDate, timezone, DEFAULT_DATE_FORMAT);
  }

  const dateObj =
    typeof scheduledDate === 'string' ? new Date(scheduledDate) : scheduledDate;
  return dateObj.toLocaleString('en-US', DEFAULT_DATE_FORMAT);
}
