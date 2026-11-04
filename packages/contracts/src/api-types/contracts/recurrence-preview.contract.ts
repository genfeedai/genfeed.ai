/**
 * Deterministic, side-effect-free recurrence previews.
 *
 * The owning release supplies the initial scheduled instant and IANA timezone.
 * Returned occurrences are repeats after that instant; the original scheduled
 * release is not included. Calendar arithmetic happens in the owning timezone
 * so the local wall-clock time remains stable when the UTC offset changes.
 */

import { z } from 'zod';
import { PostFrequency } from '../..';
import {
  nonNegativeIntSchema,
  timezoneSchema,
} from '../helpers/common-schemas';
import {
  createLocalDateTimeFormatter,
  type LocalDateTime,
  localDateTimeToInstant,
  readLocalDateTime,
} from '../helpers/local-date-time';
import { recurrenceInputSchema } from './scheduler.contract';

export const DEFAULT_RECURRENCE_PREVIEW_LIMIT = 100;
export const MAX_RECURRENCE_PREVIEW_LIMIT = 500;

const absoluteDateTimeSchema = z.iso.datetime({ offset: true });

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

export const recurrencePreviewValidationIssueSchema = z.object({
  code: z.enum(['invalid_input', 'invalid_local_time', 'invalid_timezone']),
  message: z.string(),
  path: z.string().optional(),
});

export type RecurrencePreviewValidationIssue = z.infer<
  typeof recurrencePreviewValidationIssueSchema
>;

export type RecurrencePreviewResult =
  | {
      isExhausted: boolean;
      occurrences: string[];
      success: true;
    }
  | {
      issues: RecurrencePreviewValidationIssue[];
      success: false;
    };

type ParsedRecurrencePreviewInput = z.output<
  typeof recurrencePreviewInputSchema
>;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

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
  const month = (((monthIndex % 12) + 12) % 12) + 1;

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

type RecurrencePreviewFailure = Extract<
  RecurrencePreviewResult,
  { success: false }
>;

type PreviewFormatterResult =
  | { formatter: Intl.DateTimeFormat; success: true }
  | RecurrencePreviewFailure;

function invalidInputResult(
  result: z.ZodSafeParseError<unknown>,
): RecurrencePreviewFailure {
  return {
    issues: result.error.issues.map((issue) => ({
      code: 'invalid_input',
      message: issue.message,
      path: issue.path.join('.'),
    })),
    success: false,
  };
}

function createPreviewFormatter(timezone: string): PreviewFormatterResult {
  const formatter = createLocalDateTimeFormatter(timezone);
  if (!formatter) {
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
  return { formatter, success: true };
}

function collectRecurrenceOccurrences(
  input: ParsedRecurrencePreviewInput,
  formatter: Intl.DateTimeFormat,
): RecurrencePreviewResult {
  const { limit, recurrence, repeatCount, startAt } = input;
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
    return { isExhausted: true, occurrences: [], success: true };
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
      return { isExhausted: true, occurrences, success: true };
    }

    if (occurrences.length >= limit) {
      return { isExhausted: false, occurrences, success: true };
    }

    const candidate = localDateTimeToInstant(localCandidate, formatter);
    if (!candidate) {
      return {
        issues: [
          {
            code: 'invalid_local_time',
            message: 'A recurrence occurrence falls in a missing local time.',
          },
        ],
        success: false,
      };
    }

    if (endInstant && candidate > endInstant) {
      return { isExhausted: true, occurrences, success: true };
    }

    occurrences.push(candidate.toISOString());
  }

  return { isExhausted: true, occurrences, success: true };
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

  const formatterResult = createPreviewFormatter(parsed.data.timezone);
  if (!formatterResult.success) {
    return formatterResult;
  }

  return collectRecurrenceOccurrences(parsed.data, formatterResult.formatter);
}
