'use client';

import { setButtonActionListener } from '@ui/primitives/button-action';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import {
  addSentryActionBreadcrumb,
  setSentryRouteContext,
} from '@/lib/analytics/sentry-context';

/**
 * The app resolver pulls in the app rail registry and its icons. This component
 * sits in the root layout, so the resolver loads on demand to keep that weight
 * out of every route's first-load JavaScript.
 */
function loadAppResolver() {
  return import('@/lib/analytics/analytics-app').then(
    (module) => module.resolveAnalyticsApp,
  );
}

/**
 * Keeps Sentry's `app`/`route` tags on the current page and reports labeled
 * button clicks (`<Button action="clipper.export">`) as a Sentry breadcrumb and,
 * in the cloud build, a PostHog event. Mounted once at the root so every
 * surface, signed in or not, gets the same context.
 */
export default function AppContextSync() {
  const pathname = usePathname();

  useEffect(() => {
    let isCurrent = true;

    void loadAppResolver().then((resolveAnalyticsApp) => {
      if (isCurrent) {
        setSentryRouteContext(resolveAnalyticsApp(pathname), pathname);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [pathname]);

  useEffect(() => {
    setButtonActionListener((action) => {
      addSentryActionBreadcrumb(action);

      const clickedPathname = window.location.pathname;
      void loadAppResolver().then((resolveAnalyticsApp) => {
        captureAnalyticsEvent(ANALYTICS_EVENTS.UI_ACTION_CLICKED, {
          action,
          app: resolveAnalyticsApp(clickedPathname),
        });
      });
    });

    return () => setButtonActionListener(null);
  }, []);

  return null;
}
