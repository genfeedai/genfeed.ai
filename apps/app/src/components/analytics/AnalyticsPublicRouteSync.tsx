'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthUser } from '@hooks/auth/use-auth-user';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  captureAnalyticsPageview,
  clearAnalyticsOrganization,
  ensureAnalyticsAnonymous,
  identifyAnalyticsUser,
  isAnalyticsEnabled,
} from '@/lib/analytics';

function EnabledAnalyticsPublicRouteSync() {
  const { isLoaded: isAuthLoaded, user } = useAuthUser();
  const pathname = usePathname();
  const isLogoutRoute = pathname === APP_ROUTES.LOGOUT;
  const pageviewKey = `${user?.id ?? 'anonymous'}:public:${pathname}`;
  const isInternal =
    user?.primaryEmailAddress?.emailAddress
      ?.trim()
      .toLowerCase()
      .endsWith('@genfeed.ai') === true;

  useEffect(() => {
    if (!isAuthLoaded || isLogoutRoute) {
      return;
    }

    if (user?.id) {
      identifyAnalyticsUser({ id: user.id, isInternal });
      clearAnalyticsOrganization();
      return;
    }

    ensureAnalyticsAnonymous();
  }, [isAuthLoaded, isInternal, isLogoutRoute, user?.id]);

  useEffect(() => {
    if (!isAuthLoaded || isLogoutRoute) {
      return;
    }

    captureAnalyticsPageview(pageviewKey);
  }, [isAuthLoaded, isLogoutRoute, pageviewKey]);

  return null;
}

/** Synchronize account scope before pageviews on public auth/callback routes. */
export default function AnalyticsPublicRouteSync() {
  return isAnalyticsEnabled() ? <EnabledAnalyticsPublicRouteSync /> : null;
}
