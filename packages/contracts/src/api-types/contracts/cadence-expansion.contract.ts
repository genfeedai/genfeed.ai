/**
 * Deterministic cadence expansion for calendar ghosts.
 *
 * A cadence is a posting plan, not a copy of an existing post. Occurrences are
 * wall-clock instants in the cadence timezone. Window end is inclusive so
 * "every 2 hours, 08:00–22:00" includes 22:00.
 *
 * Foundation for epic #3247, child #3250.
 */

import { z } from 'zod';
import { CadenceGenerateLanding, PostCategory } from '../..';
import { entityIdSchema, timezoneSchema } from '../helpers/common-schemas';

export const MAX_CADENCE_WINDOW_OCCURRENCES = 500;
export const MAX_CADENCE_OCCURRENCES = 1000;
export const MAX_CADENCE_SPAN_DAYS = 365;
export const MIN_INTERVAL_MINUTES = 15;
export const MAX_INTERVAL_MINUTES = 7 * 24 * 60;
export const SLOT_CONSUMPTION_TOLERANCE_MS = 30 * 60 * 1000;

const absoluteDateTimeSchema = z.iso.datetime({ offset: true });

export const cadenceExpansionInputSchema = z
  .object({
    cadenceId: entityIdSchema.nullable(),
    credentialId: entityIdSchema,
    endsAt: absoluteDateTimeSchema.optional(),
    format: z.nativeEnum(PostCategory),
    intervalMinutes: z
      .number()
      .int()
      .min(MIN_INTERVAL_MINUTES)
      .max(MAX_INTERVAL_MINUTES),
    maxOccurrences: z
      .number()
      .int()
      .positive()
      .max(MAX_CADENCE_OCCURRENCES)
      .optional(),
    startsAt: absoluteDateTimeSchema,
    timezone: timezoneSchema,
    windowEndMinute: z
      .number()
      .int()
      .min(0)
      .max(24 * 60),
    windowStartMinute: z
      .number()
      .int()
      .min(0)
      .max(24 * 60),
  })
  .superRefine((input, context) => {
    if (input.endsAt === undefined && input.maxOccurrences === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A cadence requires an end date or a max occurrence count.',
        path: ['endsAt'],
      });
    }
    if (input.windowEndMinute < input.windowStartMinute) {
      context.addIssue({
        code: 'custom',
        message: 'windowEndMinute must be on or after windowStartMinute.',
        path: ['windowEndMinute'],
      });
    }
  });

export type CadenceExpansionInput = z.input<typeof cadenceExpansionInputSchema>;

export const cadenceRangeSchema = z.object({
  end: absoluteDateTimeSchema,
  start: absoluteDateTimeSchema,
});

export type CadenceRange = z.input<typeof cadenceRangeSchema>;

export type CadenceExpansionIssue = {
  code: 'invalid_input' | 'invalid_timezone' | 'unbounded';
  message: string;
  path?: string;
};

export type CadenceOccurrence = {
  identityKey: string;
  instantUtc: string;
};

export type CadenceExpansionResult =
  | {
      isTruncated: boolean;
      occurrences: CadenceOccurrence[];
      success: true;
    }
  | {
      issues: CadenceExpansionIssue[];
      success: false;
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

export function buildSlotIdentityKey(input: {
  cadenceId: string | null;
  credentialId: string;
  format: string;
  instantUtc: string;
}): string {
  return [
    input.cadenceId ?? 'manual',
    input.credentialId,
    input.format,
    input.instantUtc,
  ].join('|');
}

/**
 * Two cadences that land on the same credential, format, and instant collapse
 * to one occurrence. The oldest cadence (createdAt, then id) keeps the slot.
 */
export type CollapsibleCadenceOccurrence = {
  cadenceCreatedAt: string;
  cadenceId: string;
  credentialId: string;
  format: string;
  instantUtc: string;
};

export function collapseOverlappingCadenceOccurrences<
  T extends CollapsibleCadenceOccurrence,
>(occurrences: T[]): T[] {
  const winners = new Map<string, T>();
  for (const occurrence of occurrences) {
    const collapseKey = [
      occurrence.credentialId,
      occurrence.format,
      occurrence.instantUtc,
    ].join('|');
    const existing = winners.get(collapseKey);
    if (!existing || isOlderCadence(occurrence, existing)) {
      winners.set(collapseKey, occurrence);
    }
  }
  return [...winners.values()];
}

function isOlderCadence(
  candidate: CollapsibleCadenceOccurrence,
  existing: CollapsibleCadenceOccurrence,
): boolean {
  const createdDelta =
    Date.parse(candidate.cadenceCreatedAt) -
    Date.parse(existing.cadenceCreatedAt);
  if (createdDelta !== 0) {
    return createdDelta < 0;
  }
  return candidate.cadenceId < existing.cadenceId;
}

export function isWithinConsumptionTolerance(
  occurrenceInstant: string,
  scheduledInstant: string,
): boolean {
  const occurrenceTime = Date.parse(occurrenceInstant);
  const scheduledTime = Date.parse(scheduledInstant);
  if (!Number.isFinite(occurrenceTime) || !Number.isFinite(scheduledTime)) {
    return false;
  }
  return (
    Math.abs(scheduledTime - occurrenceTime) <= SLOT_CONSUMPTION_TOLERANCE_MS
  );
}

export const cadenceGenerateLandingSchema = z.nativeEnum(
  CadenceGenerateLanding,
);

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

function calendarDateValue(local: LocalDateTime): number {
  return Date.UTC(local.year, local.month - 1, local.day);
}

function addCalendarDays(local: LocalDateTime, days: number): LocalDateTime {
  const next = new Date(calendarDateValue(local) + days * MILLISECONDS_PER_DAY);
  return {
    ...local,
    day: next.getUTCDate(),
    month: next.getUTCMonth() + 1,
    year: next.getUTCFullYear(),
  };
}

function issuesFromZod(error: z.ZodError): CadenceExpansionIssue[] {
  return error.issues.map((issue) => ({
    code: 'invalid_input' as const,
    message: issue.message,
    path: issue.path.join('.'),
  }));
}

export function expandCadenceOccurrences(
  input: CadenceExpansionInput,
  range: CadenceRange,
): CadenceExpansionResult {
  const parsed = cadenceExpansionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { issues: issuesFromZod(parsed.error), success: false };
  }
  const rangeParsed = cadenceRangeSchema.safeParse(range);
  if (!rangeParsed.success) {
    return { issues: issuesFromZod(rangeParsed.error), success: false };
  }

  const formatter = createFormatter(parsed.data.timezone);
  if (!formatter) {
    return {
      issues: [
        {
          code: 'invalid_timezone',
          message: 'The cadence timezone is not a valid IANA zone.',
          path: 'timezone',
        },
      ],
      success: false,
    };
  }

  const startsAt = new Date(parsed.data.startsAt);
  const rangeStart = new Date(rangeParsed.data.start);
  const rangeEnd = new Date(rangeParsed.data.end);
  const maxSpanEnd = new Date(
    startsAt.getTime() + MAX_CADENCE_SPAN_DAYS * MILLISECONDS_PER_DAY,
  );
  const endsAt = parsed.data.endsAt
    ? new Date(Math.min(Date.parse(parsed.data.endsAt), maxSpanEnd.getTime()))
    : maxSpanEnd;
  const maxOccurrences = parsed.data.maxOccurrences ?? MAX_CADENCE_OCCURRENCES;

  const startLocal = readLocalDateTime(formatter, startsAt);
  const endLocal = readLocalDateTime(formatter, endsAt);
  const occurrences: CadenceOccurrence[] = [];
  let dayCursor = {
    ...startLocal,
    hour: 0,
    millisecond: 0,
    minute: 0,
    second: 0,
  };
  const lastDayValue = calendarDateValue(endLocal);

  while (calendarDateValue(dayCursor) <= lastDayValue) {
    for (
      let minute = parsed.data.windowStartMinute;
      minute <= parsed.data.windowEndMinute;
      minute += parsed.data.intervalMinutes
    ) {
      if (minute >= 24 * 60) {
        break;
      }
      const local: LocalDateTime = {
        ...dayCursor,
        hour: Math.floor(minute / 60),
        millisecond: 0,
        minute: minute % 60,
        second: 0,
      };
      const instant = localDateTimeToInstant(local, formatter);
      if (!instant) {
        continue;
      }
      if (instant < startsAt || instant > endsAt) {
        continue;
      }
      occurrences.push({
        identityKey: buildSlotIdentityKey({
          cadenceId: parsed.data.cadenceId,
          credentialId: parsed.data.credentialId,
          format: parsed.data.format,
          instantUtc: instant.toISOString(),
        }),
        instantUtc: instant.toISOString(),
      });
      if (occurrences.length >= maxOccurrences) {
        break;
      }
    }
    if (occurrences.length >= maxOccurrences) {
      break;
    }
    dayCursor = addCalendarDays(dayCursor, 1);
  }

  const inRange = occurrences.filter((occurrence) => {
    const time = Date.parse(occurrence.instantUtc);
    return time >= rangeStart.getTime() && time <= rangeEnd.getTime();
  });
  const truncated =
    inRange.length > MAX_CADENCE_WINDOW_OCCURRENCES ||
    occurrences.length >= maxOccurrences;
  return {
    isTruncated: truncated,
    occurrences: inRange.slice(0, MAX_CADENCE_WINDOW_OCCURRENCES),
    success: true,
  };
}
