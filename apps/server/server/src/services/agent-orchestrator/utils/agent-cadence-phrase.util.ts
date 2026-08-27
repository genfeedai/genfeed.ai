import { TIMEZONES } from '@helpers/formatting/timezone/timezone.helper';

export interface ParsedCadencePhrase {
  schedule: string;
  timezone?: string;
}

/**
 * Deterministic hours for day-part phrases ("every morning") so a cadence ask
 * without an explicit time still maps onto one canonical cron instead of
 * failing the parse and re-prompting the user.
 */
const DAY_PART_HOURS: Record<string, number> = {
  afternoon: 15,
  evening: 18,
  morning: 9,
  night: 21,
};

const WEEKDAY_NUMBERS: Record<string, number> = {
  friday: 5,
  monday: 1,
  saturday: 6,
  sunday: 0,
  thursday: 4,
  tuesday: 2,
  wednesday: 3,
};

function to24Hour(params: {
  hourRaw: string;
  minuteRaw?: string;
  meridiem?: string;
}): { hour: number; minute: number } {
  const minute = params.minuteRaw ? Number.parseInt(params.minuteRaw, 10) : 0;
  let hour = Number.parseInt(params.hourRaw, 10);

  if (params.meridiem === 'pm' && hour < 12) {
    hour += 12;
  }
  if (params.meridiem === 'am' && hour === 12) {
    hour = 0;
  }

  return { hour, minute };
}

export function extractTimezoneFromMessage(
  content: string,
): string | undefined {
  const ianaMatch = content.match(/\b([a-z]+\/[a-z_]+(?:\/[a-z_]+)?)\b/i);
  if (ianaMatch?.[1]) {
    return ianaMatch[1];
  }

  const timezoneAliases: Record<string, string> = {
    cet: 'Europe/Paris',
    cst: 'America/Chicago',
    est: 'America/New_York',
    london: 'Europe/London',
    malta: 'Europe/Malta',
    paris: 'Europe/Paris',
    pst: 'America/Los_Angeles',
    utc: 'UTC',
  };

  for (const timezone of TIMEZONES) {
    const normalizedLabel = timezone.label.toLowerCase();
    if (
      content.includes(timezone.value.toLowerCase()) ||
      content.includes(normalizedLabel.split(' ')[0])
    ) {
      return timezone.value;
    }
  }

  for (const [alias, resolvedTimezone] of Object.entries(timezoneAliases)) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(content)) {
      return resolvedTimezone;
    }
  }

  return undefined;
}

/**
 * Parse a natural-language cadence phrase into a canonical cron expression.
 *
 * Covers the common variants required by the schedule-any-workflow PRD
 * (#2661): daily/each-day with an explicit time, day-part phrases like
 * "every morning", weekday cadences, a specific day of the week, and a day
 * of the month. Returns `null` when the phrase is ambiguous (for example
 * "every day" with no time) so callers ask one clarifying question instead
 * of guessing.
 */
export function parseCadencePhrase(
  content: string,
): ParsedCadencePhrase | null {
  const normalized = content.toLowerCase();
  const timezone = extractTimezoneFromMessage(normalized);

  const dailyMatch = normalized.match(
    /\b(?:every\s+day|each\s+day|daily)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
  );
  if (dailyMatch) {
    const { hour, minute } = to24Hour({
      hourRaw: dailyMatch[1],
      meridiem: dailyMatch[3],
      minuteRaw: dailyMatch[2],
    });
    return { schedule: `${minute} ${hour} * * *`, timezone };
  }

  const weekdayMatch = normalized.match(
    /\b(?:every\s+weekday|each\s+weekday|weekdays)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
  );
  if (weekdayMatch) {
    const { hour, minute } = to24Hour({
      hourRaw: weekdayMatch[1],
      meridiem: weekdayMatch[3],
      minuteRaw: weekdayMatch[2],
    });
    return { schedule: `${minute} ${hour} * * 1-5`, timezone };
  }

  const weeklyMatch = normalized.match(
    /\b(?:every|each)(?:\s+week)?\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
  );
  if (weeklyMatch) {
    const { hour, minute } = to24Hour({
      hourRaw: weeklyMatch[2],
      meridiem: weeklyMatch[4],
      minuteRaw: weeklyMatch[3],
    });
    return {
      schedule: `${minute} ${hour} * * ${WEEKDAY_NUMBERS[weeklyMatch[1]]}`,
      timezone,
    };
  }

  const monthlyMatch = normalized.match(
    /\b(?:every|each)\s+month(?:\s+on)?\s+(?:day\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
  );
  if (monthlyMatch) {
    const { hour, minute } = to24Hour({
      hourRaw: monthlyMatch[2],
      meridiem: monthlyMatch[4],
      minuteRaw: monthlyMatch[3],
    });
    return {
      schedule: `${minute} ${hour} ${monthlyMatch[1]} * *`,
      timezone,
    };
  }

  // Day-part phrasing ("every morning", "each evening at 7") — an explicit
  // time wins; otherwise the canonical day-part hour applies.
  const dayPartMatch = normalized.match(
    /\b(?:every|each)\s+(morning|afternoon|evening|night)(?:(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?\b/,
  );
  if (dayPartMatch) {
    const dayPart = dayPartMatch[1];
    if (dayPartMatch[2]) {
      const { hour, minute } = to24Hour({
        hourRaw: dayPartMatch[2],
        meridiem: dayPartMatch[4],
        minuteRaw: dayPartMatch[3],
      });
      return { schedule: `${minute} ${hour} * * *`, timezone };
    }
    return { schedule: `0 ${DAY_PART_HOURS[dayPart]} * * *`, timezone };
  }

  return null;
}
