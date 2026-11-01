'use client';

import { useViewerTimeZone } from '@genfeedai/hooks/ui/use-viewer-time-zone/use-viewer-time-zone';
import type { TableDateCellProps } from '@genfeedai/props/ui/display/table-date-cell.props';

const EMPTY_CELL = '-';

function toDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getYear(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(
    date,
  );
}

/**
 * A date in a table cell, on one line. The current year is left out ("Oct 25,
 * 10:41 PM"), an older one replaces the time ("Oct 25, 2025"), and the full
 * date and time sit in the tooltip. The cell never wraps: a date broken over
 * two lines is unreadable and makes rows uneven.
 */
export default function TableDateCell({
  value,
  timeZone: timeZoneOverride,
  hasTime = true,
}: TableDateCellProps) {
  const viewerTimeZone = useViewerTimeZone();
  const timeZone = timeZoneOverride ?? viewerTimeZone;
  const date = value || value === 0 ? toDate(value) : null;

  if (!date) {
    return <span className="text-xs text-muted-foreground">{EMPTY_CELL}</span>;
  }

  const isCurrentYear =
    getYear(date, timeZone) === getYear(new Date(), timeZone);
  const label = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone,
    ...(isCurrentYear
      ? hasTime
        ? { hour: 'numeric', minute: '2-digit' }
        : {}
      : { year: 'numeric' }),
  }).format(date);
  const fullLabel = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeZone,
    ...(hasTime ? { timeStyle: 'short' } : {}),
  }).format(date);

  return (
    <time
      className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"
      dateTime={date.toISOString()}
      suppressHydrationWarning
      title={fullLabel}
    >
      {label}
    </time>
  );
}
