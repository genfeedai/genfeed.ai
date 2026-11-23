'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  formatFullDate,
  formatShortDate,
  toValidDate,
} from '@genfeedai/helpers/formatting/date/short-date.helper';
import { useViewerTimeZone } from '@genfeedai/hooks/ui/use-viewer-time-zone/use-viewer-time-zone';
import type { DateTextProps } from '@genfeedai/props/ui/time/date-text.props';
import { SimpleTooltip } from '@ui/primitives/tooltip';

const DEFAULT_EMPTY_LABEL = 'Not set';

/**
 * The one way to show a date. It is the short date ("Nov 23, 8:27 AM") in the
 * viewer's zone, on one line, with the full date and time in its tooltip. The
 * current year is left out and an older year replaces the time. No relative
 * dates ("3 hours ago") in lists, tables or cards.
 *
 * It renders the same text on the server and on the first client render (UTC),
 * then the viewer's zone, so a hard load shows no hydration warning.
 */
export default function DateText({
  className,
  emptyLabel = DEFAULT_EMPTY_LABEL,
  hasTime = true,
  timeZone: timeZoneOverride,
  value,
}: DateTextProps) {
  const viewerTimeZone = useViewerTimeZone();
  const timeZone = timeZoneOverride ?? viewerTimeZone;
  const date = toValidDate(value);

  if (!date) {
    return (
      <span className={cn('text-muted-foreground', className)}>
        {emptyLabel}
      </span>
    );
  }

  return (
    <SimpleTooltip label={formatFullDate(date, { hasTime, timeZone })}>
      <time
        className={cn('whitespace-nowrap tabular-nums', className)}
        dateTime={date.toISOString()}
        suppressHydrationWarning
      >
        {formatShortDate(date, { hasTime, timeZone })}
      </time>
    </SimpleTooltip>
  );
}
