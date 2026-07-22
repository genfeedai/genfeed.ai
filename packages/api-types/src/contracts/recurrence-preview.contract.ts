/**
 * Deterministic, side-effect-free recurrence previews.
 *
 * The owning release supplies the initial scheduled instant and IANA timezone.
 * Returned occurrences are repeats after that instant; the original scheduled
 * release is not included. Calendar arithmetic happens in the owning timezone
 * so the local wall-clock time remains stable when the UTC offset changes.
 */

import { PostFrequency } from '@genfeedai/enums';
import { z } from 'zod';
import { nonNegativeIntSchema, timezoneSchema } from '../helpers/common-schemas';
import { recurrenceInputSchema } from './scheduler.contract';

export const DEFAULT_RECURRENCE_PREVIEW_LIMIT = 100;
export const MAX_RECURRENCE_PREVIEW_LIMIT = 500;

const absoluteDateTimeSchema = z.string().datetime({ offset: true });

export const recurrencePreviewInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .positive()
      .max(MAX_RECURRENCE_PREVIEW_LIMIT)
      .default(DEFAULT_RECURRENCE_PREVIEW_LIMIT),
    recurrence: recurrenceInputSchema,
    repeatCount: nonNegativeIntSchema.default(0),
    startAt: absoluteDateTimeSchema,
    timezone: timezoneSchema,
  })
  .superRefine((input, context) => {
    if (
      input.recurrence.endDate &&
      !absoluteDateTimeSchema.safeParse(input.recurrence.endDate).success
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Recurrence preview endDate requires a timezone offset.',
        path: ['recurrence', 'endDate'],
      });
    }
  });

export type RecurrencePreviewInput = z.input<
  typeof recurrencePreviewInputSchema
>;

export interface RecurrencePreviewValidationIssue {
  code: 'invalid_input' | 'invalid_local_time' | 'invalid_timezone';
  message: string;
  path?: string;
}

export type RecurrencePreviewResult =
  | {
      exhausted: boolean;
      occurrences: string[];
      success: true;
    }
  | {
      issues: RecurrencePreviewValidationIssue[];
      success: false;
    };

interface LocalDateTime {
  day: number;
  hour: number;
  millisecond: number;
  minute: number;
  month: number;
  second: number;
  year: number;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

function createFormatter(timezone: string): Intl.DateTimeFormat {
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
    day: parts.get('day') ?? 0,
    hour: parts.get('hour') ?? 0,
    millisecond: instant.getUTCMilliseconds(),
    minute: parts.get('minute') ?? 0,
    month: parts.get('month') ?? 0,
    second: parts.get('second') ?? 0,
    year: parts.get('year') ?? 0,
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
  return (
    actual.year === expected.year &&
    actual.month === expected.month &&
    actual.day === expected.day &&
    actual.hour === expected.hour &&
    actual.minute === expected.minute &&
    actual.second === expected.second &&
    actual.millisecond === expected.millisecond
  );
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

  // Offset iteration works across fractional-hour zones and offset changes.
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const candidate = new Date(candidateValue);
    const actualValue = localDateTimeValue(
      readLocalDateTime(formatter, candidate),
    );
    const adjustment = desiredValue - actualValue;

    if (adjustment === 0) {
      return candidate;
    }
    candidateValue += adjustment;
  }

  const candidate = new Date(candidateValue);
  return matchesLocalDateTime(readLocalDateTime(formatter, candidate), local)
    ? candidate
    : null;
}

function calendarDateValue(local: LocalDateTime): number {
  return Date.UTC(local.year, local.month - 1, local.day);
}

function withCalendarDate(
  local: LocalDateTime,
  calendarDate: Date,
): LocalDateTime {
  return {
    ...local,
    day: calendarDate.getUTCDate(),
    month: calendarDate.getUTCMonth() + 1,
    year: calendarDate.getUTCFullYear(),
  };
}

function addCalendarDays(local: LocalDateTime, days: number): LocalDateTime {
  return withCalendarDate(
    local,
    new Date(calendarDateValue(local) + days * MILLISECONDS_PER_DAY),
  );
}

function hasCalendarDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
}

function addCalendarMonths(
  local: LocalDateTime,
  months: number,
): LocalDateTime | null {
  const monthIndex = local.month - 1 + months;
  const year = local.year + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;

  return hasCalendarDay(year, month, local.day)
    ? { ...local, month, year }
    : null;
}

function addCalendarYears(
  local: LocalDateTime,
  years: number,
): LocalDateTime | null {
  const year = local.year + years;
  return hasCalendarDay(year, local.month, local.day)
    ? { ...local, year }
    : null;
}

function* dailyCandidates(
  start: LocalDateTime,
  interval: number,
): Generator<LocalDateTime> {
  for (let iteration = 1; ; iteration += 1) {
    yield addCalendarDays(start, iteration * interval);
  }
}

function* weeklyCandidates(
  start: LocalDateTime,
  interval: number,
  weekdays: readonly number[],
): Generator<LocalDateTime> {
  const selectedWeekdays = [...weekdays].sort((left, right) => left - right);
  const startDateValue = calendarDateValue(start);
  const startWeekday = new Date(startDateValue).getUTCDay();
  const anchorWeekStart = startDateValue - startWeekday * MILLISECONDS_PER_DAY;

  for (let activeWeek = 0; ; activeWeek += interval) {
    const activeWeekStart =
      anchorWeekStart + activeWeek * 7 * MILLISECONDS_PER_DAY;

    for (const weekday of selectedWeekdays) {
      const candidateDateValue =
        activeWeekStart + weekday * MILLISECONDS_PER_DAY;
      if (candidateDateValue > startDateValue) {
        yield withCalendarDate(start, new Date(candidateDateValue));
      }
    }
  }
}

function* monthlyCandidates(
  start: LocalDateTime,
  interval: number,
): Generator<LocalDateTime> {
  for (let iteration = 1; ; iteration += 1) {
    const candidate = addCalendarMonths(start, iteration * interval);
    if (candidate) {
      yield candidate;
    }
  }
}

function* yearlyCandidates(
  start: LocalDateTime,
  interval: number,
): Generator<LocalDateTime> {
  for (let iteration = 1; ; iteration += 1) {
    const candidate = addCalendarYears(start, iteration * interval);
    if (candidate) {
      yield candidate;
    }
  }
}

function createCandidates(
  start: LocalDateTime,
  frequency: PostFrequency,
  interval: number,
  weekdays: readonly number[],
): Generator<LocalDateTime> {
  switch (frequency) {
    case PostFrequency.DAILY:
      return dailyCandidates(start, interval);
    case PostFrequency.WEEKLY:
      return weeklyCandidates(start, interval, weekdays);
    case PostFrequency.MONTHLY:
      return monthlyCandidates(start, interval);
    case PostFrequency.YEARLY:
      return yearlyCandidates(start, interval);
    case PostFrequency.NEVER:
      throw new Error('Non-repeating frequency passed recurrence validation.');
  }

  throw new Error(`Unsupported recurrence frequency: ${frequency}`);
}

function invalidInputResult(
  result: z.ZodSafeParseError<unknown>,
): RecurrencePreviewResult {
  return {
    issues: result.error.issues.map((issue) => ({
      code: 'invalid_input',
      message: issue.message,
      path: issue.path.join('.'),
    })),
    success: false,
  };
}

/**
 * Preview future repeat instants without creating jobs or durable records.
 */
export function previewRecurrenceOccurrences(
  input: RecurrencePreviewInput,
): RecurrencePreviewResult {
  const parsed = recurrencePreviewInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidInputResult(parsed);
  }

  const { limit, recurrence, repeatCount, startAt, timezone } = parsed.data;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = createFormatter(timezone);
  } catch {
    return {
      issues: [
        {
          code: 'invalid_timezone',
          message: `Invalid IANA timezone: ${timezone}`,
          path: 'timezone',
        },
      ],
      success: false,
    };
  }

  const startInstant = new Date(startAt);
  const endInstant = recurrence.endDate
    ? new Date(recurrence.endDate)
    : undefined;
  const remainingRepeats = recurrence.maxRepeats
    ? recurrence.maxRepeats - repeatCount
    : undefined;

  if (
    (remainingRepeats !== undefined && remainingRepeats <= 0) ||
    (endInstant && endInstant <= startInstant)
  ) {
    return { exhausted: true, occurrences: [], success: true };
  }

  const startLocal = readLocalDateTime(formatter, startInstant);
  const candidates = createCandidates(
    startLocal,
    recurrence.frequency,
    recurrence.interval,
    recurrence.weekdays ?? [],
  );
  const occurrences: string[] = [];

  for (const localCandidate of candidates) {
    if (
      remainingRepeats !== undefined &&
      occurrences.length >= remainingRepeats
    ) {
      return { exhausted: true, occurrences, success: true };
    }

    const candidate = localDateTimeToInstant(localCandidate, formatter);
    if (!candidate) {
      return {
        issues: [
          {
            code: 'invalid_local_time',
            message: 'A recurrence occurrence falls in a missing local time.',
            path: 'startAt',
          },
        ],
        success: false,
      };
    }

    if (endInstant && candidate > endInstant) {
      return { exhausted: true, occurrences, success: true };
    }

    if (occurrences.length >= limit) {
      return { exhausted: false, occurrences, success: true };
    }

    occurrences.push(candidate.toISOString());
  }

  return { exhausted: true, occurrences, success: true };
}
