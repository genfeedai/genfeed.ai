// ============================================
// Number Formatting
// ============================================

/**
 * Format a number with K/M suffix for large numbers
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

/**
 * Format a number as percentage with sign prefix
 */
export function formatPercentage(num: number): string {
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(1)}%`;
}

// ============================================
// Date Formatting
// ============================================

interface TimeDiff {
  minutes: number;
  hours: number;
  days: number;
}

function getTimeDiff(dateString: string): TimeDiff | null {
  try {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    return {
      days: Math.floor(diffMs / 86400000),
      hours: Math.floor(diffMs / 3600000),
      minutes: Math.floor(diffMs / 60000),
    };
  } catch {
    return null;
  }
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

  return fallbackDate.toLocaleDateString();
}

/**
 * Format a date string to a relative time (e.g., "5m ago", "2d ago")
 */
export function formatRelativeDate(dateString: string): string {
  const diff = getTimeDiff(dateString);
  if (!diff) {
    return dateString;
  }

  return formatRelativeTime(diff, new Date(dateString), false);
}

/**
 * Format a date string to a verbose relative time (e.g., "5 minutes ago")
 */
export function formatRelativeDateVerbose(dateString: string): string {
  const diff = getTimeDiff(dateString);
  if (!diff) {
    return dateString;
  }

  return formatRelativeTime(diff, new Date(dateString), true);
}

/**
 * Format a date string to a full localized date with time
 */
export function formatFullDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format a date string to a short date with time
 */
export function formatShortDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      weekday: 'short',
    });
  } catch {
    return dateString;
  }
}
