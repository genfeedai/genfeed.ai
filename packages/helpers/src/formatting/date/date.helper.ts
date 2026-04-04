import {
  endOfDay,
  format,
  formatDistance,
  formatRelative,
  parseISO,
  startOfDay,
} from 'date-fns';

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

export function formatDate(
  date: Date | string | number | null | undefined,
  dateFormat: string = DATE_FORMATS.SHORT_DATE,
): string {
  if (!date) {
    return '';
  }

  try {
    let dateObj: Date;

    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      dateObj = parseISO(date);
    } else if (typeof date === 'number') {
      dateObj = new Date(date);
    } else {
      return '';
    }

    if (Number.isNaN(dateObj.getTime())) {
      return '';
    }

    return format(dateObj, dateFormat);
  } catch (_error) {
    return '';
  }
}

export function toApiFormat(date: Date | string | number): string {
  return formatDate(date, DATE_FORMATS.API_FORMAT);
}

export function getRelativeTime(date: Date | string | number): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  return formatDistance(dateObj, new Date(), { addSuffix: true });
}

export function getRelativeDate(date: Date | string | number): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  return formatRelative(dateObj, new Date());
}

export function isValidDate(date: string | number | Date): boolean {
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  return dateObj instanceof Date && !Number.isNaN(dateObj.getTime());
}

export function getStartOfDay(date: Date | string | number): Date {
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  return startOfDay(dateObj);
}

export function getEndOfDay(date: Date | string | number): Date {
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  return endOfDay(dateObj);
}
