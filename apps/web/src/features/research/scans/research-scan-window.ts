import type { ResearchScanLimitWindow } from '@genfeedai/contracts/interfaces';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A window longer than a day reads as "this week"; anything else as "today". */
export function isWeeklyScanWindow(limit: ResearchScanLimitWindow): boolean {
  return limit.windowMs > DAY_MS;
}
