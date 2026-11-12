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

interface PendingAsk {
  isCanceled: boolean;
  isPrioritized: boolean;
  prefetch: (href: string) => void;
  targets: readonly string[];
}

const pendingAsks: PendingAsk[] = [];

// The router drains its prefetch queue newest-first, so what is asked for last
// is fetched first. Callers that ask in the same tick are flushed together,
// prioritized callers last, so the order does not depend on which component
// happened to mount first.
function flushPendingAsks(): void {
  const asks = pendingAsks.splice(0);
  asks.sort((a, b) => Number(a.isPrioritized) - Number(b.isPrioritized));
  for (const ask of asks) {
    if (ask.isCanceled) {
      continue;
    }
    for (const href of ask.targets) {
      ask.prefetch(href);
    }
  }
}

function enqueueAsk(ask: PendingAsk): void {
  pendingAsks.push(ask);
  if (pendingAsks.length === 1) {
    queueMicrotask(flushPendingAsks);
  }
}

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
 *
 * Used by the rail and by the sidebar, which share this refresh so that a
 * click on either never lands on an expired entry. The first pass runs when
 * the caller mounts, so a click in the first seconds after the shell paints
 * finds its destination already requested; later passes run when the browser
 * is idle. `startDelayMs` holds the first pass back for callers whose
 * destinations nobody can click yet. `isPrioritized` asks after every other caller of the same tick, so
 * the router fetches that caller's destinations first.
 */
export function useKeepRoutesPrefetched(
  hrefs: readonly string[],
  {
    isPrioritized = false,
    startDelayMs = 0,
  }: { isPrioritized?: boolean; startDelayMs?: number } = {},
): void {
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
    let lastAsk: PendingAsk | null = null;
    const ask = () => {
      lastAsk = {
        isCanceled: false,
        isPrioritized,
        prefetch: (href) => router.prefetch(href),
        targets,
      };
      enqueueAsk(lastAsk);
    };
    const warm = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      cancelIdle?.();
      cancelIdle = scheduleIdle(() => {
        cancelIdle = null;
        ask();
      });
    };

    // Destinations nobody can click yet (the rail's menu) wait out the first
    // seconds, so the sidebar's requests are not queued behind them.
    const askIfVisible = () => {
      if (document.visibilityState === 'visible') {
        ask();
      }
    };
    const startTimeout =
      startDelayMs > 0 ? window.setTimeout(askIfVisible, startDelayMs) : null;
    if (startTimeout === null) {
      askIfVisible();
    }
    const interval = window.setInterval(warm, ROUTE_PREFETCH_REFRESH_MS);
    document.addEventListener('visibilitychange', warm);

    return () => {
      if (startTimeout !== null) {
        window.clearTimeout(startTimeout);
      }
      cancelIdle?.();
      if (lastAsk) {
        lastAsk.isCanceled = true;
      }
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', warm);
    };
  }, [hrefKey, isPrioritized, router, startDelayMs]);
}
