type DateInput = Date | string | number;

export interface ShortDateOptions {
  /** Show the time after the date. Off for day-precision values. */
  hasTime?: boolean;
  /** IANA zone to show the instant in. Defaults to the runtime's zone. */
  timeZone?: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(
  key: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cached = formatters.get(key);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat('en-US', options);
  formatters.set(key, formatter);
  return formatter;
}

/** The instant as a `Date`, or `null` when there is none or it is not a date. */
export function toValidDate(value: DateInput | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function yearOf(date: Date, timeZone: string | undefined): string {
  return formatterFor(`year|${timeZone ?? ''}`, {
    timeZone,
    year: 'numeric',
  }).format(date);
}

/**
 * The one short date: "Nov 23, 8:27 AM". The current year is left out, an
 * older year replaces the time ("Nov 23, 2025"), and a day-precision value
 * ("hasTime: false") is "Nov 23". Empty or invalid input is an empty string.
 */
export function formatShortDate(
  value: DateInput | null | undefined,
  { hasTime = true, timeZone }: ShortDateOptions = {},
  now: Date = new Date(),
): string {
  const date = toValidDate(value);
  if (!date) {
    return '';
  }

  const isCurrentYear = yearOf(date, timeZone) === yearOf(now, timeZone);
  if (!isCurrentYear) {
    return formatterFor(`short-year|${timeZone ?? ''}`, {
      day: 'numeric',
      month: 'short',
      timeZone,
      year: 'numeric',
    }).format(date);
  }

  return hasTime
    ? formatterFor(`short-time|${timeZone ?? ''}`, {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        timeZone,
      }).format(date)
    : formatterFor(`short-day|${timeZone ?? ''}`, {
        day: 'numeric',
        month: 'short',
        timeZone,
      }).format(date);
}

/** The full date and time for a tooltip or title: "Sunday, November 23, 2026 at 8:27 AM". */
export function formatFullDate(
  value: DateInput | null | undefined,
  { hasTime = true, timeZone }: ShortDateOptions = {},
): string {
  const date = toValidDate(value);
  if (!date) {
    return '';
  }

  return formatterFor(`full|${hasTime}|${timeZone ?? ''}`, {
    dateStyle: 'full',
    timeZone,
    ...(hasTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}
