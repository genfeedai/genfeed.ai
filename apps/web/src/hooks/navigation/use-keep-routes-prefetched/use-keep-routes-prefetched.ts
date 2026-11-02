'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

/**
 * How often the shell re-asks the router for its destinations. A destination
 * still in the router cache costs nothing; one that expired (the router drops
 * prefetched routes after `staleTimes.static`, 300s) is fetched again, so a
 * click never lands on an expired entry for longer than this window.
 */
export const ROUTE_PREFETCH_REFRESH_MS = 30_000;

function scheduleIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: 2_000 });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(callback, 1);
  return () => window.clearTimeout(handle);
}

/**
 * Keeps the given in-app destinations in the router's prefetch cache for as
 * long as the caller is mounted.
 *
 * The router only paints a destination at once when it already holds that
 * route's prefetched shell. Without one, the click waits for the full server
 * render (1-2.5s on production) with the old page on screen. `<Link>` only
 * prefetches while it is in the viewport, and the entry expires after
 * `staleTimes.static`, so destinations behind a menu (the rail's More menu)
 * and every destination after five minutes on one page would block. Shells
 * are static and served without the auth proxy, so warming them is cheap.
 */
export function useKeepRoutesPrefetched(hrefs: readonly string[]): void {
  const router = useRouter();
  const hrefKey = useMemo(
    () => [...new Set(hrefs.filter((href) => href.startsWith('/')))].join('\n'),
    [hrefs],
  );

  useEffect(() => {
    const targets = hrefKey ? hrefKey.split('\n') : [];
    if (targets.length === 0) {
      return;
    }

    let cancelIdle: (() => void) | null = null;
    const warm = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      cancelIdle?.();
      cancelIdle = scheduleIdle(() => {
        cancelIdle = null;
        for (const href of targets) {
          router.prefetch(href);
        }
      });
    };

    warm();
    const interval = window.setInterval(warm, ROUTE_PREFETCH_REFRESH_MS);
    document.addEventListener('visibilitychange', warm);

    return () => {
      cancelIdle?.();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', warm);
    };
  }, [hrefKey, router]);
}
