export const TIMEZONES = [
  { label: 'UTC (Coordinated Universal Time)', offset: 0, value: 'UTC' },
  { label: 'New York (EST/EDT)', offset: -5, value: 'America/New_York' },
  { label: 'Chicago (CST/CDT)', offset: -6, value: 'America/Chicago' },
  { label: 'Denver (MST/MDT)', offset: -7, value: 'America/Denver' },
  { label: 'Los Angeles (PST/PDT)', offset: -8, value: 'America/Los_Angeles' },
  { label: 'Anchorage (AKST/AKDT)', offset: -9, value: 'America/Anchorage' },
  { label: 'Honolulu (HST)', offset: -10, value: 'Pacific/Honolulu' },
  { label: 'São Paulo (BRT)', offset: -3, value: 'America/Sao_Paulo' },
  { label: 'London (GMT/BST)', offset: 0, value: 'Europe/London' },
  { label: 'Paris (CET/CEST)', offset: 1, value: 'Europe/Paris' },
  { label: 'Berlin (CET/CEST)', offset: 1, value: 'Europe/Berlin' },
  { label: 'Moscow (MSK)', offset: 3, value: 'Europe/Moscow' },
  { label: 'Dubai (GST)', offset: 4, value: 'Asia/Dubai' },
  { label: 'India (IST)', offset: 5.5, value: 'Asia/Kolkata' },
  { label: 'Shanghai (CST)', offset: 8, value: 'Asia/Shanghai' },
  { label: 'Tokyo (JST)', offset: 9, value: 'Asia/Tokyo' },
  { label: 'Sydney (AEDT/AEST)', offset: 11, value: 'Australia/Sydney' },
  { label: 'Auckland (NZDT/NZST)', offset: 13, value: 'Pacific/Auckland' },
];

const DATETIME_PARTS_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  year: 'numeric',
};

const datetimePartsFormatters = new Map<string, Intl.DateTimeFormat>();
const displayFormatters = new Map<string, Intl.DateTimeFormat>();

function getDateTimePartsFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = datetimePartsFormatters.get(timezone);
  if (cached) {
    return cached;
  }

  const formatter = Intl.DateTimeFormat('en-US', {
    ...DATETIME_PARTS_FORMAT,
    timeZone: timezone,
  });
  datetimePartsFormatters.set(timezone, formatter);
  return formatter;
}

function getDisplayFormatter(
  timezone: string,
  format: string,
): Intl.DateTimeFormat {
  const cacheKey = `${timezone}:${format}`;
  const cached = displayFormatters.get(cacheKey);
  if (cached) {
    return cached;
  }

  const formatter = Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: '2-digit',
    hour12: true,
    minute: '2-digit',
    month: format === 'short' ? 'short' : 'long',
    timeZone: timezone,
    year: format === 'short' ? undefined : 'numeric',
  });
  displayFormatters.set(cacheKey, formatter);
  return formatter;
}

function extractDateParts(
  formatter: Intl.DateTimeFormat,
  date: Date,
): Record<string, string> {
  const parts = formatter.formatToParts(date);
  const dateParts: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      dateParts[part.type] = part.value;
    }
  }
  return dateParts;
}

function getTimezoneOffset(timezone: string): number {
  return TIMEZONES.find((t) => t.value === timezone)?.offset ?? 0;
}

export function convertToUTC(localDate: Date, timezone: string = 'UTC'): Date {
  try {
    const dateParts = extractDateParts(
      getDateTimePartsFormatter(timezone),
      localDate,
    );
    const isoString = `${dateParts.year}-${dateParts.month}-${dateParts.day}T${dateParts.hour}:${dateParts.minute}:${dateParts.second}`;

    return new Date(`${isoString}Z`);
  } catch (_error) {
    const offset = getTimezoneOffset(timezone);
    const utcTime = localDate.getTime() - offset * 60 * 60 * 1000;
    return new Date(utcTime);
  }
}

export function convertFromUTC(utcDate: Date, timezone: string = 'UTC'): Date {
  if (timezone === 'UTC') {
    return new Date(utcDate);
  }

  try {
    const formatted = getDateTimePartsFormatter(timezone).format(utcDate);
    const [datePart, timePart] = formatted.split(', ');
    const [month, day, year] = datePart.split('/');
    const [hour, minute, second] = timePart.split(':');

    return new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10),
    );
  } catch (_error) {
    const offset = getTimezoneOffset(timezone);
    const localTime = utcDate.getTime() + offset * 60 * 60 * 1000;
    return new Date(localTime);
  }
}

export function formatDateInTimezone(
  date: Date | string,
  timezone: string = 'UTC',
  format: string = 'full',
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  try {
    return getDisplayFormatter(timezone, format).format(dateObj);
  } catch (_error) {
    return dateObj.toLocaleString();
  }
}

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (_error) {
    return 'UTC';
  }
}

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch (_error) {
    return false;
  }
}

export function createDateFromTimezone(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string = 'UTC',
): Date {
  if (timezone === 'UTC') {
    return new Date(Date.UTC(year, month - 1, day, hours, minutes));
  }

  const baseUtcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));

  function getPartValue(
    parts: Intl.DateTimeFormatPart[],
    type: string,
  ): number {
    return parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
  }

  const parts = getDateTimePartsFormatter(timezone).formatToParts(baseUtcDate);
  const formattedYear = getPartValue(parts, 'year');
  const formattedMonth = getPartValue(parts, 'month');
  const formattedDay = getPartValue(parts, 'day');
  const formattedHour = getPartValue(parts, 'hour');
  const formattedMinute = getPartValue(parts, 'minute');

  const desiredDate = new Date(Date.UTC(year, month - 1, day));
  const formattedDate = new Date(
    Date.UTC(formattedYear, formattedMonth - 1, formattedDay),
  );
  const dayDiffMs = desiredDate.getTime() - formattedDate.getTime();

  const desiredTotalMinutes = hours * 60 + minutes;
  const formattedTotalMinutes = formattedHour * 60 + formattedMinute;
  const timeDiffMs = (desiredTotalMinutes - formattedTotalMinutes) * 60 * 1000;

  return new Date(baseUtcDate.getTime() + dayDiffMs + timeDiffMs);
}

const DATE_TIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Render an instant as the `YYYY-MM-DDTHH:mm` string an `<input
 * type="datetime-local">` expects, read in `timezone` rather than the browser's.
 *
 * A schedule is anchored to an IANA zone, so an operator in another zone must
 * still see (and edit) the time the content will actually publish at. Returns
 * an empty string for a missing or unparseable instant, which is exactly what a
 * controlled empty input needs.
 */
export function toDateTimeLocalInput(
  value: string | Date | null | undefined,
  timezone: string,
): string {
  if (!value) {
    return '';
  }

  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  try {
    const parts = new Map(
      new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        timeZone: timezone,
        year: 'numeric',
      })
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );

    const year = parts.get('year');
    const month = parts.get('month');
    const day = parts.get('day');
    const hour = parts.get('hour');
    const minute = parts.get('minute');
    if (!year || !month || !day || !hour || !minute) {
      return '';
    }

    return `${year}-${month}-${day}T${hour}:${minute}`;
  } catch (_error) {
    return '';
  }
}

/**
 * Inverse of {@link toDateTimeLocalInput}: interpret a `datetime-local` value as
 * wall-clock time in `timezone` and return the corresponding UTC instant.
 *
 * Returns `null` rather than throwing when the value is not a well-formed
 * `datetime-local` string, so each caller can phrase its own validation error.
 */
export function fromDateTimeLocalInput(
  value: string,
  timezone: string,
): string | null {
  const match = value.match(DATE_TIME_LOCAL_PATTERN);
  if (!match) {
    return null;
  }

  return createDateFromTimezone(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10),
    Number.parseInt(match[4], 10),
    Number.parseInt(match[5], 10),
    timezone,
  ).toISOString();
}
