'use client';

import type { NavigationStartDetail } from '@genfeedai/contracts/interfaces';
import { Progress } from '@ui/primitives/progress';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import type { NavigationBlockedOutcome } from '@/lib/analytics/analytics-events';
import { captureNavigationBlocked } from '@/lib/analytics/navigation-analytics';
import {
  navigationChangesLocation,
  subscribeNavigationStart,
} from '@/lib/navigation/navigation-events';
import { toRoutePattern } from '@/lib/navigation/route-pattern';

/**
 * A navigation that commits inside this window never shows the bar, so a
 * prefetched route stays flash-free and only the slow ones are acknowledged.
 */
export const NAVIGATION_PROGRESS_DELAY_MS = 150;

/**
 * Safety valve for a transition that never commits a new location: an
 * aborted fetch, or a guard that sends the user straight back.
 */
export const NAVIGATION_PROGRESS_MAX_MS = 20_000;

type PendingNavigation = NavigationStartDetail & {
  /** Document href when the router announced the transition. */
  fromHref: string;
  /** `performance.now()` when the router announced the transition. */
  startedAt: number;
};

type BarSighting = Pick<
  PendingNavigation,
  'fromHref' | 'navigationType' | 'startedAt' | 'url'
>;

function reportSighting(
  sightingRef: MutableRefObject<BarSighting | null>,
  outcome: NavigationBlockedOutcome,
): void {
  const sighting = sightingRef.current;
  if (!sighting) {
    return;
  }
  sightingRef.current = null;
  captureNavigationBlocked({
    fromRoute: toRoutePattern(sighting.fromHref, sighting.fromHref),
    navigationType: sighting.navigationType,
    outcome,
    toRoute: toRoutePattern(sighting.url, sighting.fromHref),
    waitMs: Math.round(performance.now() - sighting.startedAt),
  });
}

/**
 * Thin bar across the top of the app while the router waits on a destination
 * it cannot paint yet. A click on a route that is not prefetched (or whose
 * prefetch went stale) keeps the old page on screen, unchanged, until the
 * server render lands; without this the click looks ignored and people click
 * again. Armed by `onRouterTransitionStart` (see `instrumentation-client.ts`),
 * cleared the moment the committed pathname or search changes. Each time the
 * bar becomes visible, one `navigation_blocked` analytics event records the
 * route pattern it left, the one it was going to, the wait and the outcome.
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';
  const translate = useTranslations('common.navigationProgress');
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const sightingRef = useRef<BarSighting | null>(null);

  useEffect(
    () =>
      subscribeNavigationStart(({ navigationType, url }) => {
        if (!navigationChangesLocation(url, window.location.href)) {
          return;
        }
        const fromHref = window.location.href;
        const startedAt = performance.now();
        // The hook fires inside Next's own startTransition, so a state update
        // made here would be batched into the navigation and only commit with
        // the destination, when the bar is no longer needed. A macrotask runs
        // outside that scope; a fast navigation may have committed by then.
        window.setTimeout(() => {
          if (navigationChangesLocation(url, window.location.href)) {
            // A bar still up for the previous transition ends here unfinished.
            reportSighting(sightingRef, 'abandoned');
            setPending({ fromHref, navigationType, startedAt, url });
          }
        }, 0);
      }),
    [],
  );

  // The committed location changing is the only "transition finished" signal
  // the router exposes to the tree; it also covers back/forward and redirects.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname and search are the trigger
  useEffect(() => {
    reportSighting(sightingRef, 'committed');
    setPending(null);
  }, [pathname, search]);

  useEffect(() => {
    if (pending === null) {
      setIsVisible(false);
      return;
    }

    const showTimer = window.setTimeout(() => {
      if (!navigationChangesLocation(pending.url, window.location.href)) {
        setPending(null);
        return;
      }
      sightingRef.current = pending;
      setIsVisible(true);
    }, NAVIGATION_PROGRESS_DELAY_MS);
    const capTimer = window.setTimeout(() => {
      reportSighting(sightingRef, 'abandoned');
      setPending(null);
    }, NAVIGATION_PROGRESS_MAX_MS);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(capTimer);
    };
  }, [pending]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60]"
      data-testid="navigation-progress"
    >
      <Progress
        aria-label={translate('loading')}
        isIndeterminate
        size="xs"
        tone="primary"
      />
    </div>
  );
}
