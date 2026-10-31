export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

export function formatPercentage(num: number): string {
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(1)}%`;
}

interface TimeDiff {
  minutes: number;
  hours: number;
  days: number;
}

function parseValidDate(dateString: string): Date | null {
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTimeDiff(date: Date): TimeDiff {
  const diffMs = Date.now() - date.getTime();
  return {
    days: Math.floor(diffMs / 86400000),
    hours: Math.floor(diffMs / 3600000),
    minutes: Math.floor(diffMs / 60000),
  };
}

function formatRelativeTime(
  diff: TimeDiff,
  fallbackDate: Date,
  verbose: boolean,
): string {
  const { minutes, hours, days } = diff;

  if (minutes < 1) {
    return 'Just now';
  }

  if (minutes < 60) {
    return verbose
      ? `${minutes} minute${minutes > 1 ? 's' : ''} ago`
      : `${minutes}m ago`;
  }

  if (hours < 24) {
    return verbose
      ? `${hours} hour${hours > 1 ? 's' : ''} ago`
      : `${hours}h ago`;
  }

  if (days < 7) {
    return verbose ? `${days} day${days > 1 ? 's' : ''} ago` : `${days}d ago`;
  }

  return fallbackDate.toLocaleDateString('en-US');
}

function formatRelativeDateWithVerbosity(
  dateString: string,
  verbose: boolean,
): string {
  const date = parseValidDate(dateString);
  if (!date) {
    return dateString;
  }

  return formatRelativeTime(getTimeDiff(date), date, verbose);
}

export const formatRelativeDate = (dateString: string): string =>
  formatRelativeDateWithVerbosity(dateString, false);

export const formatRelativeDateVerbose = (dateString: string): string =>
  formatRelativeDateWithVerbosity(dateString, true);

export function formatFullDate(dateString: string): string {
  const date = parseValidDate(dateString);
  if (!date) {
    return dateString;
  }

  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function formatShortDate(dateString: string): string {
  const date = parseValidDate(dateString);
  if (!date) {
    return dateString;
  }

  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    weekday: 'short',
  });
}
