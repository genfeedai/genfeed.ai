export function formatCompactNumber(
  num: number | string | null | undefined,
): string {
  if (num === null || num === undefined) {
    return '0';
  }

  const parsedNum = typeof num === 'string' ? parseFloat(num) : num;

  if (Number.isNaN(parsedNum)) {
    return '0';
  }

  if (parsedNum >= 1000000) {
    return `${(parsedNum / 1000000).toFixed(1)}M`;
  }
  if (parsedNum >= 1000) {
    return `${(parsedNum / 1000).toFixed(1)}k`;
  }
  return parsedNum.toString();
}

export function formatNumberWithCommas(
  value: number | string | null | undefined,
): string {
  if (value === null || value === undefined) {
    return '0';
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (Number.isNaN(num)) {
    return '0';
  }

  return num.toLocaleString('en-US');
}

export function capitalize(str: string | null | undefined): string {
  if (!str) {
    return '';
  }
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Format number using Intl.NumberFormat with compact notation (1K, 1.2M)
 * Preferred for chart axes and tooltips
 */
export function formatCompactNumberIntl(
  value: number | null | undefined,
): string {
  if (value === null || value === undefined) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);
}

/**
 * Format number with full precision and commas (1,234,567)
 * Preferred for tooltip values where full numbers are needed
 */
export function formatFullNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '0';
  }

  return new Intl.NumberFormat('en-US').format(value);
}

export interface FormatPercentageOptions {
  showSign?: boolean;
  decimals?: number;
}

/**
 * Format percentage with optional sign (+12.5%, -3.2%)
 * @param value - The percentage value
 * @param options - Configuration options
 * @param options.showSign - Whether to show + sign for positive numbers (default: true)
 * @param options.decimals - Number of decimal places (default: 1)
 */
export function formatPercentage(
  value: number | null | undefined,
  options: FormatPercentageOptions = {},
): string {
  const { showSign = true, decimals = 1 } = options;

  if (value === null || value === undefined) {
    return '0%';
  }

  const sign = showSign && value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format percentage without sign (12.5%)
 * Simple version for display without growth indicator
 */
export function formatPercentageSimple(
  value: number | null | undefined,
  decimals: number = 1,
): string {
  if (value === null || value === undefined) {
    return '0%';
  }

  return `${value.toFixed(decimals)}%`;
}

/**
 * Format date for chart axes (Jan 15)
 */
export function formatChartDate(
  date: Date | string | number | null | undefined,
): string {
  if (date === null || date === undefined) {
    return '';
  }

  const dateObj = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(dateObj.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
  }).format(dateObj);
}

/**
 * Format date for tooltips with time (Jan 15, 3:30 PM)
 */
export function formatTooltipDateTime(
  date: Date | string | number | null | undefined,
): string {
  if (date === null || date === undefined) {
    return '';
  }

  const dateObj = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(dateObj.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(dateObj);
}

/**
 * Format hour for display (3 PM, 12 AM)
 */
export function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${period}`;
}
