function formatTime(hour: number, minute: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
}

function parseNumberList(value: string): number[] | null {
  const parts = value.split(',');
  if (!parts.every((part) => /^\d{1,2}$/.test(part))) {
    return null;
  }

  return parts.map((part) => Number.parseInt(part, 10));
}

function isWildcard(value: string): boolean {
  return value === '*';
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function formatDayOfWeek(dayOfWeek: string): string | null {
  if (dayOfWeek === '1-5') {
    return 'weekday';
  }

  if (!/^\d$/.test(dayOfWeek)) {
    return null;
  }

  return DAY_NAMES[Number.parseInt(dayOfWeek, 10)] ?? null;
}

export function formatRecurringSchedule(
  schedule: string,
  timezone: string,
  count?: number,
): string {
  const cronParts = schedule.trim().split(/\s+/);
  const countLabel = count && count > 1 ? ` • ${count} assets per run` : '';

  if (cronParts.length !== 5) {
    return `${schedule} (${timezone})${countLabel}`;
  }

  const [minutePart, hourPart, dayOfMonth, month, dayOfWeek] = cronParts;
  const minutes = parseNumberList(minutePart);
  const hours = parseNumberList(hourPart);

  if (
    !minutes ||
    !hours ||
    minutes.length !== 1 ||
    hours.length === 0 ||
    !isWildcard(month)
  ) {
    return `${schedule} (${timezone})${countLabel}`;
  }

  const minute = minutes[0];
  const formattedTimes = hours.map((hour) => formatTime(hour, minute));
  const joinedTimes =
    formattedTimes.length === 1
      ? formattedTimes[0]
      : `${formattedTimes.slice(0, -1).join(', ')} and ${formattedTimes.at(-1)}`;

  if (isWildcard(dayOfMonth) && isWildcard(dayOfWeek)) {
    const cadence = formattedTimes.length === 1 ? 'Every day' : 'Every day';
    return `${cadence} at ${joinedTimes} (${timezone})${countLabel}`;
  }

  if (isWildcard(dayOfMonth) && !isWildcard(dayOfWeek)) {
    const dayLabel = formatDayOfWeek(dayOfWeek);
    if (dayLabel === 'weekday') {
      return `Every weekday at ${joinedTimes} (${timezone})${countLabel}`;
    }
    if (dayLabel) {
      return `Every ${dayLabel} at ${joinedTimes} (${timezone})${countLabel}`;
    }
  }

  if (!isWildcard(dayOfMonth) && isWildcard(dayOfWeek)) {
    return `Every month on day ${dayOfMonth} at ${joinedTimes} (${timezone})${countLabel}`;
  }

  return `${schedule} (${timezone})${countLabel}`;
}
