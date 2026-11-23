export interface DateTextProps {
  className?: string;
  /**
   * What an empty date means here ("Not scheduled", "Not published"). Never a
   * bare dash.
   */
  emptyLabel?: string;
  /** Show the time after the date. Off for day-precision values. */
  hasTime?: boolean;
  /**
   * IANA zone to show the instant in. Defaults to the viewer's zone, read
   * hydration-safely (UTC on the server and first render, then the browser's).
   */
  timeZone?: string;
  /** The instant to show; `null` or `undefined` renders `emptyLabel`. */
  value: Date | string | number | null | undefined;
}
