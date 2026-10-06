import type { CaptureContext } from '@sentry/browser';

/**
 * Reports the logger raised in the browser before Sentry had a client.
 *
 * The website starts Sentry once the page is idle, so an error caught by a
 * boundary during boot would otherwise reach `captureException` with no
 * client and be dropped. The logger holds such reports here, and the website's
 * deferred Sentry start replays them right after `Sentry.init`. Where Sentry
 * starts eagerly (the app), a client always exists and nothing is held.
 */
export type HeldSentryReport =
  | { context: CaptureContext; error: unknown; kind: 'exception' }
  | { context: CaptureContext; kind: 'message'; message: string };

/** Enough to see what broke during boot without flooding a crash loop. */
const MAX_HELD_REPORTS = 20;

const heldReports: HeldSentryReport[] = [];

export function holdSentryReport(report: HeldSentryReport): void {
  if (heldReports.length < MAX_HELD_REPORTS) {
    heldReports.push(report);
  }
}

/** Hands over every held report and clears the queue. */
export function takeHeldSentryReports(): HeldSentryReport[] {
  return heldReports.splice(0);
}
