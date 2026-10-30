'use client';

import { setButtonActionListener } from '@ui/primitives/button-action';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import { resolveAnalyticsApp } from '@/lib/analytics/analytics-app';
import {
  addSentryActionBreadcrumb,
  setSentryRouteContext,
} from '@/lib/analytics/sentry-context';

/**
 * Keeps Sentry's `app`/`route` tags on the current page and reports labeled
 * button clicks (`<Button action="clipper.export">`) as a Sentry breadcrumb and,
 * in the cloud build, a PostHog event. Mounted once at the root so every
 * surface, signed in or not, gets the same context.
 */
export default function AppContextSync() {
  const pathname = usePathname();

  useEffect(() => {
    setSentryRouteContext(resolveAnalyticsApp(pathname), pathname);
  }, [pathname]);

  useEffect(() => {
    setButtonActionListener((action) => {
      addSentryActionBreadcrumb(action);
      captureAnalyticsEvent(ANALYTICS_EVENTS.UI_ACTION_CLICKED, {
        action,
        app: resolveAnalyticsApp(window.location.pathname),
      });
    });

    return () => setButtonActionListener(null);
  }, []);

  return null;
}
