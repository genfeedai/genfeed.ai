import * as Sentry from '@sentry/nextjs';

type NavigationEntryType =
  | 'back_forward'
  | 'navigate'
  | 'prerender'
  | 'reload'
  | 'unknown';

function readNavigationType(): NavigationEntryType {
  const entry = performance.getEntriesByType('navigation')[0];

  if (!entry) {
    return 'unknown';
  }

  return (entry as PerformanceNavigationTiming).type;
}

/**
 * Tags describing the document state at the moment hydration is about to
 * start. Sentry scrubs the URL, route and mismatch text of a "Hydration error"
 * Replay issue, so these are the only facts left to tell the causes apart:
 * whether the tab was hidden (reveals of streamed content wait for the next
 * frame), whether the HTML stream was still arriving, how many streamed
 * Suspense boundaries were still unrevealed, and whether the load was a
 * reload, a back/forward restore or a prerender activation.
 *
 * Call it from `instrumentation-client`, which runs before React hydrates.
 */
export function recordHydrationEntryContext(): void {
  if (typeof document === 'undefined' || typeof performance === 'undefined') {
    return;
  }

  Sentry.setTags({
    hydration_load_type: readNavigationType(),
    hydration_pending_boundaries: String(
      document.querySelectorAll('template[id^="B:"]').length,
    ),
    hydration_ready_state: document.readyState,
    hydration_visibility: document.visibilityState,
  });
}
