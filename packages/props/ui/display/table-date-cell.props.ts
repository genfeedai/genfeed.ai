export interface TableDateCellProps {
  /** The instant to show; `null` or `undefined` renders the empty-cell dash. */
  value: Date | string | null | undefined;
  /**
   * IANA zone to show the instant in. Required so server and client render the
   * same text: pass the hydration-safe viewer zone the page already uses.
   */
  timeZone: string;
  /** Show the time after the date. Off for day-precision values. */
  hasTime?: boolean;
}
