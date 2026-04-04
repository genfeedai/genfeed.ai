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
    const formatter = new Intl.DateTimeFormat('en-US', {
      ...DATETIME_PARTS_FORMAT,
      timeZone: timezone,
    });

    const dateParts = extractDateParts(formatter, localDate);
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
    const formatter = new Intl.DateTimeFormat('en-US', {
      ...DATETIME_PARTS_FORMAT,
      timeZone: timezone,
    });

    const formatted = formatter.format(utcDate);
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
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      hour: '2-digit',
      hour12: true,
      minute: '2-digit',
      month: format === 'short' ? 'short' : 'long',
      timeZone: timezone,
      year: format === 'short' ? undefined : 'numeric',
    };

    return new Intl.DateTimeFormat('en-US', options).format(dateObj);
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
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
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

  const formatter = new Intl.DateTimeFormat('en-US', {
    ...DATETIME_PARTS_FORMAT,
    timeZone: timezone,
  });

  function getPartValue(
    parts: Intl.DateTimeFormatPart[],
    type: string,
  ): number {
    return parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
  }

  const parts = formatter.formatToParts(baseUtcDate);
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
