export interface TableDateCellProps {
  /** What an empty date means in this column, such as "Not scheduled". */
  emptyLabel?: string;
  /** The instant to show; `null` or `undefined` renders `emptyLabel`. */
  value: Date | string | number | null | undefined;
  /**
   * IANA zone to show the instant in. Defaults to the viewer's zone, read
   * hydration-safely (UTC on the server and first render, then the browser's).
   */
  timeZone?: string;
  /** Show the time after the date. Off for day-precision values. */
  hasTime?: boolean;
}
