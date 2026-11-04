/**
 * Wall-clock arithmetic in an IANA timezone, shared by the cadence, posting-time
 * and recurrence contracts so they resolve DST gaps and overlaps identically.
 */

export type LocalDateTime = {
  day: number;
  hour: number;
  millisecond: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

function requiredDatePart(parts: Map<string, number>, name: string): number {
  const value = parts.get(name);
  if (value === undefined) {
    throw new Error(`Intl.DateTimeFormat omitted the ${name} date part.`);
  }
  return value;
}

export function createLocalDateTimeFormatter(
  timezone: string,
): Intl.DateTimeFormat | null {
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

export function readLocalDateTime(
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

export function localDateTimeValue(local: LocalDateTime): number {
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

export function matchesLocalDateTime(
  actual: LocalDateTime,
  expected: LocalDateTime,
): boolean {
  return localDateTimeValue(actual) === localDateTimeValue(expected);
}

export function localDateTimeToInstant(
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
    candidateValue += desiredValue - actualValue;
  }

  const candidate = new Date(candidateValue);
  return matchesLocalDateTime(readLocalDateTime(formatter, candidate), local)
    ? candidate
    : null;
}
