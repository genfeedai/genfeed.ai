'use client';

import type { TableDateCellProps } from '@genfeedai/props/ui/display/table-date-cell.props';
import DateText from '@ui/time/DateText';

/** An empty cell is a dash, the table convention; a column can say more. */
const EMPTY_CELL = '-';

/**
 * A date in a table cell: `DateText` in the table's small muted type. The
 * cell never wraps, because a date broken over two lines is unreadable and
 * makes rows uneven.
 */
export default function TableDateCell({
  emptyLabel = EMPTY_CELL,
  hasTime = true,
  timeZone,
  value,
}: TableDateCellProps) {
  return (
    <DateText
      className="text-xs text-muted-foreground"
      emptyLabel={emptyLabel}
      hasTime={hasTime}
      timeZone={timeZone}
      value={value}
    />
  );
}
