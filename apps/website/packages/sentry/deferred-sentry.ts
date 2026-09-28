import type { BrowserOptions } from '@sentry/nextjs';
import { runWhenIdle } from '../analytics/run-when-idle';

/** Enough to see what broke during boot without flooding a crash loop. */
const MAX_EARLY_ERRORS = 10;

/**
 * Start browser error reporting without putting the Sentry SDK on the critical
 * path.
 *
 * The SDK is ~75 KB gzip, about a quarter of every marketing page's first-load
 * JavaScript. It now loads once the page is idle. Errors thrown before then are
 * held by two plain listeners and reported as soon as the SDK is up, so the
 * boot window is not a blind spot.
 */
export function initDeferredSentry(options: BrowserOptions): void {
  const earlyErrors: unknown[] = [];
  const earlyListeners = new AbortController();

  const hold = (error: unknown) => {
    if (earlyErrors.length < MAX_EARLY_ERRORS) {
      earlyErrors.push(error);
    }
  };

  window.addEventListener(
    'error',
    (event) => {
      // Resource load failures (an <img> 404) are plain Events, not script
      // errors; Sentry's own handler ignores them too.
      if (event instanceof ErrorEvent) {
        hold(event.error ?? new Error(event.message));
      }
    },
    { signal: earlyListeners.signal },
  );
  window.addEventListener('unhandledrejection', (event) => hold(event.reason), {
    signal: earlyListeners.signal,
  });

  runWhenIdle(() => {
    void import('@sentry/nextjs')
      .then((Sentry) => {
        Sentry.init(options);
        earlyListeners.abort();

        for (const error of earlyErrors.splice(0)) {
          Sentry.captureException(error, {
            tags: { captured_before_sdk: 'true' },
          });
        }
      })
      .catch(() => {
        // The SDK chunk failed to load (offline, blocked). Stop holding errors
        // nobody will send.
        earlyListeners.abort();
      });
  });
}
