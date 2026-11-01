'use client';

import type { NavigationStartDetail } from '@genfeedai/contracts/interfaces';
import { Progress } from '@ui/primitives/progress';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  navigationChangesLocation,
  subscribeNavigationStart,
} from '@/lib/navigation/navigation-events';

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

/**
 * Thin bar across the top of the app while the router waits on a destination
 * it cannot paint yet. A click on a route that is not prefetched (or whose
 * prefetch went stale) keeps the old page on screen, unchanged, until the
 * server render lands; without this the click looks ignored and people click
 * again. Armed by `onRouterTransitionStart` (see `instrumentation-client.ts`),
 * cleared the moment the committed pathname or search changes.
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';
  const translate = useTranslations('common.navigationProgress');
  const [pending, setPending] = useState<Pick<
    NavigationStartDetail,
    'url'
  > | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(
    () =>
      subscribeNavigationStart(({ url }) => {
        if (!navigationChangesLocation(url, window.location.href)) {
          return;
        }
        // The hook fires inside Next's own startTransition, so a state update
        // made here would be batched into the navigation and only commit with
        // the destination, when the bar is no longer needed. A macrotask runs
        // outside that scope; a fast navigation may have committed by then.
        window.setTimeout(() => {
          if (navigationChangesLocation(url, window.location.href)) {
            setPending({ url });
          }
        }, 0);
      }),
    [],
  );

  // The committed location changing is the only "transition finished" signal
  // the router exposes to the tree; it also covers back/forward and redirects.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname and search are the trigger
  useEffect(() => {
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
      setIsVisible(true);
    }, NAVIGATION_PROGRESS_DELAY_MS);
    const capTimer = window.setTimeout(
      () => setPending(null),
      NAVIGATION_PROGRESS_MAX_MS,
    );

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
