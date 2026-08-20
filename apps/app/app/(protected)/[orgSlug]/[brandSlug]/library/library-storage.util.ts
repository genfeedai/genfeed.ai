const BYTES_PER_UNIT = 1024;
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Humanize a byte total for the Library storage meter.
 *
 * Bytes and kilobytes render whole — a footer reading "1.0 KB" is noise. Larger
 * units keep one decimal so the number still moves as assets land.
 */
export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= BYTES_PER_UNIT && unitIndex < UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }

  const shouldRoundToWhole = unitIndex <= 1;

  return `${shouldRoundToWhole ? Math.round(value) : value.toFixed(1)} ${UNITS[unitIndex]}`;
}
