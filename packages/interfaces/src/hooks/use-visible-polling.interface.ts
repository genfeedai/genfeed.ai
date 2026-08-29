export interface UseVisiblePollingOptions {
  /** Poll cadence, in milliseconds, while the document is visible. */
  intervalMs: number;
  /** Suspend polling entirely, e.g. while nothing is in flight. */
  isEnabled?: boolean;
}
