import { format, formatDistance, parseISO } from 'date-fns';

export const DATE_FORMATS = {
  API_FORMAT: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
  DISPLAY_DATE: 'MMM d, yyyy',
  DISPLAY_DATETIME: 'MMM d, yyyy h:mm a',
  ISO_DATE: 'yyyy-MM-dd',
  ISO_DATETIME: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
  LONG_DATE: 'MMMM d, yyyy',
  LONG_DATETIME: 'MMMM d, yyyy HH:mm:ss',
  MONTH_YEAR: 'MMMM yyyy',
  SHORT_DATE: 'MM/dd/yyyy',
  SHORT_DATETIME: 'MM/dd/yyyy HH:mm',
  TIME_ONLY: 'HH:mm:ss',
};

function parseDate(date: Date | string | number): Date {
  return typeof date === 'string' ? parseISO(date) : new Date(date);
}

export function formatDate(
  date: Date | string | number | null | undefined,
  dateFormat: string = DATE_FORMATS.SHORT_DATE,
): string {
  if (!date) {
    return '';
  }

  try {
    const dateObj = parseDate(date);

    if (Number.isNaN(dateObj.getTime())) {
      return '';
    }

    return format(dateObj, dateFormat);
  } catch (_error) {
    return '';
  }
}

export function getRelativeTime(date: Date | string | number): string {
  const parsedDate = parseDate(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return formatDistance(parsedDate, new Date(), { addSuffix: true });
}

export function isValidDate(date: string | number | Date): boolean {
  return !Number.isNaN(parseDate(date).getTime());
}

export type ElapsedTimeStyle = 'compact' | 'ago';

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_HOURS = 24;
const WEEK_DAYS = 7;

/**
 * Short elapsed-time label for lists and status rows.
 *
 * - `compact`: `now`, `5m`, `3h`, `2d`
 * - `ago`: `Just now`, `5m ago`, `3h ago`, `2d ago`
 *
 * From seven days on, both styles show the date (`Nov 3`, or `Nov 3, 2025`
 * outside the current year). Future timestamps
 * count as "now"; missing or invalid input returns an empty string.
 */
export function formatElapsedTime(
  value: Date | string | number | null | undefined,
  style: ElapsedTimeStyle,
  now: number = Date.now(),
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const suffix = style === 'ago' ? ' ago' : '';
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / MINUTE_MS));
  if (minutes < 1) {
    return style === 'ago' ? 'Just now' : 'now';
  }
  if (minutes < HOUR_MINUTES) {
    return `${minutes}m${suffix}`;
  }

  const hours = Math.floor(minutes / HOUR_MINUTES);
  if (hours < DAY_HOURS) {
    return `${hours}h${suffix}`;
  }

  const days = Math.floor(hours / DAY_HOURS);
  if (days < WEEK_DAYS) {
    return `${days}d${suffix}`;
  }

  const isSameYear = date.getFullYear() === new Date(now).getFullYear();
  return format(date, isSameYear ? 'MMM d' : DATE_FORMATS.DISPLAY_DATE);
}
