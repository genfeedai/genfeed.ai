/**
 * How long the browser may keep deferring idle work before it runs anyway.
 * Long enough to clear first paint and hydration on a slow phone, short enough
 * that a visitor who leaves quickly is still counted and reported.
 */
const IDLE_TIMEOUT_MS = 3000;

/** Fallback delay for engines without `requestIdleCallback` (Safari). */
const IDLE_FALLBACK_MS = 1500;

interface IdleCapableWindow {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
}

/**
 * Run `task` once the page has loaded and the browser is idle.
 *
 * `instrumentation-client` runs as part of the initial client bundle, so an
 * eager SDK import puts its request and parse cost inside the dependency graph
 * Lighthouse simulates for LCP. Third-party SDKs (analytics, error reporting)
 * start here instead.
 */
export function runWhenIdle(task: () => void): void {
  const schedule = () => {
    const requestIdle = (window as Window & IdleCapableWindow)
      .requestIdleCallback;

    if (typeof requestIdle === 'function') {
      requestIdle(task, { timeout: IDLE_TIMEOUT_MS });
      return;
    }

    window.setTimeout(task, IDLE_FALLBACK_MS);
  };

  // The main thread goes idle while images are still downloading, so an idle
  // callback alone can start an SDK download that competes with the hero
  // image. Wait for the page to finish loading first.
  if (document.readyState === 'complete') {
    schedule();
    return;
  }

  window.addEventListener('load', schedule, { once: true });
}
