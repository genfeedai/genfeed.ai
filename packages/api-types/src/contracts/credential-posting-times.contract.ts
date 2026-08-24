/**
 * Preferred posting times for a connected account.
 *
 * Clock times are stored per credential and resolved in the brand timezone.
 * They label day-view rows and feed find-next-slot. They do not lock
 * scheduling — an operator can still place a post outside the list.
 *
 * Do not reuse leftover `Schedule.slots` JSON or `Post.scheduleSlot` labels.
 */

import { z } from 'zod';
import { timezoneSchema } from '../helpers/common-schemas';

export const MAX_CREDENTIAL_POSTING_TIMES = 48;
export const MAX_NEXT_SLOT_DAYS = 365;

export const clockTimeSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

export type ClockTime = z.infer<typeof clockTimeSchema>;

export const postingTimesSchema = z
  .array(clockTimeSchema)
  .max(MAX_CREDENTIAL_POSTING_TIMES);

export type NextPostingSlot =
  | {
      found: false;
    }
  | {
      found: true;
      hour: number;
      instant: string;
      minute: number;
      timezone: string;
    };

type LocalDateTime = {
  day: number;
  hour: number;
  millisecond: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export function clockTimeMinutes(time: ClockTime): number {
  return time.hour * 60 + time.minute;
}

export function formatClockTime(time: ClockTime): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

export function parseClockTime(value: string): ClockTime | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    hour: Number.parseInt(match[1] ?? '', 10),
    minute: Number.parseInt(match[2] ?? '', 10),
  };
}

export function normalizePostingTimes(input: unknown): ClockTime[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const unique = new Map<number, ClockTime>();
  for (const entry of input) {
    const parsed = clockTimeSchema.safeParse(entry);
    if (!parsed.success) {
      continue;
    }
    unique.set(clockTimeMinutes(parsed.data), parsed.data);
  }

  return [...unique.values()]
    .sort((left, right) => clockTimeMinutes(left) - clockTimeMinutes(right))
    .slice(0, MAX_CREDENTIAL_POSTING_TIMES);
}

function requiredDatePart(parts: Map<string, number>, name: string): number {
  const value = parts.get(name);
  if (value === undefined) {
    throw new Error(`Intl.DateTimeFormat omitted the ${name} date part.`);
  }
  return value;
}

function createFormatter(timezone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone: timezone,
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

function readLocalDateTime(
  formatter: Intl.DateTimeFormat,
  instant: Date,
): LocalDateTime {
  const parts = new Map(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number.parseInt(part.value, 10)]),
  );

  return {
    day: requiredDatePart(parts, 'day'),
    hour: requiredDatePart(parts, 'hour'),
    millisecond: instant.getUTCMilliseconds(),
    minute: requiredDatePart(parts, 'minute'),
    month: requiredDatePart(parts, 'month'),
    second: requiredDatePart(parts, 'second'),
    year: requiredDatePart(parts, 'year'),
  };
}

function localDateTimeValue(local: LocalDateTime): number {
  return Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
    local.millisecond,
  );
}

function matchesLocalDateTime(
  actual: LocalDateTime,
  expected: LocalDateTime,
): boolean {
  return localDateTimeValue(actual) === localDateTimeValue(expected);
}

function localDateTimeToInstant(
  local: LocalDateTime,
  formatter: Intl.DateTimeFormat,
): Date | null {
  const desiredValue = localDateTimeValue(local);
  if (!Number.isFinite(desiredValue)) {
    return null;
  }
  let candidateValue = desiredValue;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const candidate = new Date(candidateValue);
    const actualValue = localDateTimeValue(
      readLocalDateTime(formatter, candidate),
    );
    candidateValue += desiredValue - actualValue;
  }
  const candidate = new Date(candidateValue);
  return matchesLocalDateTime(readLocalDateTime(formatter, candidate), local)
    ? candidate
    : null;
}

function addCalendarDays(local: LocalDateTime, days: number): LocalDateTime {
  const next = new Date(
    Date.UTC(local.year, local.month - 1, local.day) +
      days * MILLISECONDS_PER_DAY,
  );
  return {
    ...local,
    day: next.getUTCDate(),
    month: next.getUTCMonth() + 1,
    year: next.getUTCFullYear(),
  };
}

function localDateKey(
  local: Pick<LocalDateTime, 'day' | 'month' | 'year'>,
): string {
  return `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
}

function localSlotKey(local: LocalDateTime): string {
  return `${localDateKey(local)}T${formatClockTime({
    hour: local.hour,
    minute: local.minute,
  })}`;
}

export function resolvePostingTimezone(
  timezone: string | null | undefined,
): string {
  const parsed = timezoneSchema.safeParse(timezone?.trim() ?? '');
  if (!parsed.success) {
    return 'UTC';
  }
  return createFormatter(parsed.data) ? parsed.data : 'UTC';
}

export function buildDayViewRows(input: {
  date: Date;
  occupiedInstants: Array<Date | string>;
  preferredTimes: ClockTime[];
  timezone: string;
}): ClockTime[] {
  const timezone = resolvePostingTimezone(input.timezone);
  const formatter = createFormatter(timezone);
  const preferred = normalizePostingTimes(input.preferredTimes);
  if (!formatter) {
    return preferred;
  }

  const unique = new Map<number, ClockTime>();
  for (const time of preferred) {
    unique.set(clockTimeMinutes(time), time);
  }

  const visibleDay = localDateKey(readLocalDateTime(formatter, input.date));
  for (const instant of input.occupiedInstants) {
    const date = instant instanceof Date ? instant : new Date(instant);
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    const local = readLocalDateTime(formatter, date);
    if (localDateKey(local) !== visibleDay) {
      continue;
    }
    const time = { hour: local.hour, minute: local.minute };
    unique.set(clockTimeMinutes(time), time);
  }

  return [...unique.values()].sort(
    (left, right) => clockTimeMinutes(left) - clockTimeMinutes(right),
  );
}

export function findNextFreeSlot(input: {
  after: Date;
  occupiedInstants: Array<Date | string>;
  preferredTimes: ClockTime[];
  timezone: string;
  maxDays?: number;
}): NextPostingSlot {
  const preferred = normalizePostingTimes(input.preferredTimes);
  if (preferred.length === 0) {
    return { found: false };
  }

  const timezone = resolvePostingTimezone(input.timezone);
  const formatter = createFormatter(timezone);
  if (!formatter) {
    return { found: false };
  }

  const occupied = new Set<string>();
  for (const instant of input.occupiedInstants) {
    const date = instant instanceof Date ? instant : new Date(instant);
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    occupied.add(localSlotKey(readLocalDateTime(formatter, date)));
  }

  const afterTime = input.after.getTime();
  const maxDays = input.maxDays ?? MAX_NEXT_SLOT_DAYS;
  const startLocal = {
    ...readLocalDateTime(formatter, input.after),
    millisecond: 0,
    second: 0,
  };

  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset += 1) {
    const day = addCalendarDays(startLocal, dayOffset);
    for (const time of preferred) {
      const candidateLocal: LocalDateTime = {
        ...day,
        hour: time.hour,
        millisecond: 0,
        minute: time.minute,
        second: 0,
      };
      const candidate = localDateTimeToInstant(candidateLocal, formatter);
      if (!candidate || candidate.getTime() <= afterTime) {
        continue;
      }
      if (occupied.has(localSlotKey(candidateLocal))) {
        continue;
      }
      return {
        found: true,
        hour: time.hour,
        instant: candidate.toISOString(),
        minute: time.minute,
        timezone,
      };
    }
  }

  return { found: false };
}

export function instantForClockTime(input: {
  date: Date;
  time: ClockTime;
  timezone: string;
}): Date | null {
  const timezone = resolvePostingTimezone(input.timezone);
  const formatter = createFormatter(timezone);
  if (!formatter) {
    return null;
  }
  const day = readLocalDateTime(formatter, input.date);
  return localDateTimeToInstant(
    {
      ...day,
      hour: input.time.hour,
      millisecond: 0,
      minute: input.time.minute,
      second: 0,
    },
    formatter,
  );
}
