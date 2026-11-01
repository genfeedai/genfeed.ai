import type { NavigationStartDetail } from '@genfeedai/contracts/interfaces';

/**
 * Bridge between Next's client instrumentation hook and the app shell.
 *
 * `onRouterTransitionStart` in `instrumentation-client.ts` is the only place
 * that sees every router transition (Link clicks, `router.push`/`replace`, and
 * back/forward), but it runs outside the React tree. It announces the start on
 * `window`; `NavigationProgress` listens. The end of a transition is observed
 * from inside the tree instead: the committed pathname or search changes.
 */
export const NAVIGATION_START_EVENT = 'genfeed:navigation:start';

export function dispatchNavigationStart(detail: NavigationStartDetail): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<NavigationStartDetail>(NAVIGATION_START_EVENT, { detail }),
  );
}

export function subscribeNavigationStart(
  listener: (detail: NavigationStartDetail) => void,
): () => void {
  const handler = (event: Event) => {
    if (event instanceof CustomEvent && event.detail) {
      listener(event.detail as NavigationStartDetail);
    }
  };

  window.addEventListener(NAVIGATION_START_EVENT, handler);
  return () => window.removeEventListener(NAVIGATION_START_EVENT, handler);
}

/**
 * Whether a transition to `url` changes the document's pathname or search.
 * Same-URL clicks (Next refreshes the segments in place), hash-only jumps and
 * cross-origin hrefs never commit a new location, so nothing would clear an
 * indicator armed for them.
 */
export function navigationChangesLocation(
  url: string,
  currentHref: string,
): boolean {
  let current: URL;
  let target: URL;

  try {
    current = new URL(currentHref);
    target = new URL(url, current);
  } catch {
    return false;
  }

  if (target.origin !== current.origin) {
    return false;
  }

  return (
    target.pathname !== current.pathname || target.search !== current.search
  );
}

export function toNavigationType(
  value: unknown,
): NavigationStartDetail['navigationType'] {
  return value === 'replace' || value === 'traverse' ? value : 'push';
}
