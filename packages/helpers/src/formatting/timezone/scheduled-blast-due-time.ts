import { isValidTimezone } from '@helpers/formatting/timezone/timezone.helper';

export const SCHEDULED_BLAST_LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export const scheduledBlastDueTimeErrorValues = [
  'missing_schedule',
  'invalid_timezone',
  'invalid_local_date_time',
  'dst_gap',
  'not_in_the_future',
] as const;

export type ScheduledBlastDueTimeError =
  (typeof scheduledBlastDueTimeErrorValues)[number];

export type ScheduledBlastDueTime = {
  dueAt: Date;
  localDateTime: string;
  timezone: string;
};

export type ResolveScheduledBlastDueTimeInput = {
  localDateTime?: string | null;
  now?: Date;
  timezone?: string | null;
};

export type ResolveScheduledBlastDueTimeResult =
  | { error: ScheduledBlastDueTimeError; ok: false }
  | { ok: true; value: ScheduledBlastDueTime };

const DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  month: '2-digit',
  timeZoneName: undefined,
  year: 'numeric',
};

const OFFSET_PROBES_MS = [0, -3_600_000, 3_600_000, -7_200_000, 7_200_000];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isCalendarDateTime(parts: {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
}): boolean {
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31 ||
    parts.hour > 23 ||
    parts.minute > 59
  ) {
    return false;
  }

  const utc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  const date = new Date(utc);

  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day &&
    date.getUTCHours() === parts.hour &&
    date.getUTCMinutes() === parts.minute
  );
}

function formatInTimeZone(date: Date, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      ...DATETIME_FORMAT,
      timeZone: timezone,
    }).formatToParts(date);
    const map = new Map(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    const year = map.get('year');
    const month = map.get('month');
    const day = map.get('day');
    const hour = map.get('hour');
    const minute = map.get('minute');

    if (!year || !month || !day || !hour || !minute) {
      return null;
    }

    return `${year}-${month}-${day}T${hour}:${minute}`;
  } catch {
    return null;
  }
}

function offsetAt(date: Date, timezone: string): number | null {
  const formatted = formatInTimeZone(date, timezone);
  if (!formatted) {
    return null;
  }

  const match = formatted.match(SCHEDULED_BLAST_LOCAL_DATE_TIME_PATTERN);
  if (!match) {
    return null;
  }

  const asUtc = Date.UTC(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[3], 10),
    Number.parseInt(match[4], 10),
    Number.parseInt(match[5], 10),
  );

  return asUtc - date.getTime();
}

function resolveInstants(localDateTime: string, timezone: string): Date[] {
  const match = localDateTime.match(SCHEDULED_BLAST_LOCAL_DATE_TIME_PATTERN);
  if (!match) {
    return [];
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4], 10);
  const minute = Number.parseInt(match[5], 10);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const candidateMs = new Set<number>();

  for (const probe of OFFSET_PROBES_MS) {
    const offset = offsetAt(new Date(utcGuess + probe), timezone);
    if (offset === null) {
      continue;
    }

    candidateMs.add(utcGuess - offset);
  }

  return [...candidateMs]
    .map((ms) => new Date(ms))
    .filter((date) => formatInTimeZone(date, timezone) === localDateTime)
    .sort((left, right) => left.getTime() - right.getTime());
}

/**
 * Convert an operator-selected local wall time + IANA zone into a UTC due
 * instant.
 *
 * DST policy:
 * - Gap (spring-forward): the local time does not exist → `dst_gap`.
 * - Overlap (fall-back): the local time occurs twice → the earlier UTC
 *   instant (first occurrence).
 */
export function resolveScheduledBlastDueTime(
  input: ResolveScheduledBlastDueTimeInput,
): ResolveScheduledBlastDueTimeResult {
  const localDateTime = input.localDateTime?.trim() ?? '';
  const timezone = input.timezone?.trim() ?? '';

  if (!localDateTime || !timezone) {
    return { error: 'missing_schedule', ok: false };
  }

  if (!isValidTimezone(timezone)) {
    return { error: 'invalid_timezone', ok: false };
  }

  const match = localDateTime.match(SCHEDULED_BLAST_LOCAL_DATE_TIME_PATTERN);
  if (!match) {
    return { error: 'invalid_local_date_time', ok: false };
  }

  const parts = {
    day: Number.parseInt(match[3], 10),
    hour: Number.parseInt(match[4], 10),
    minute: Number.parseInt(match[5], 10),
    month: Number.parseInt(match[2], 10),
    year: Number.parseInt(match[1], 10),
  };

  if (!isCalendarDateTime(parts)) {
    return { error: 'invalid_local_date_time', ok: false };
  }

  const instants = resolveInstants(localDateTime, timezone);
  if (instants.length === 0) {
    return { error: 'dst_gap', ok: false };
  }

  const dueAt = instants[0];
  const now = input.now ?? new Date();
  if (dueAt.getTime() <= now.getTime()) {
    return { error: 'not_in_the_future', ok: false };
  }

  return {
    ok: true,
    value: {
      dueAt,
      localDateTime: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`,
      timezone,
    },
  };
}

export function toScheduledBlastLocalDateTime(parts: {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
}): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}
