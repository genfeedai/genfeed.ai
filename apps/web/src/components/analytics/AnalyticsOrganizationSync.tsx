'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthUser } from '@/hooks/auth/use-auth-user';
import {
  captureAnalyticsPageview,
  clearAnalyticsOrganization,
  identifyAnalyticsOrganization,
  identifyAnalyticsUser,
  isAnalyticsEnabled,
} from '@/lib/analytics';
import { resolveAnalyticsApp } from '@/lib/analytics/analytics-app';
import { setSentryAccountContext } from '@/lib/analytics/sentry-context';

function EnabledAnalyticsOrganizationSync() {
  const { isLoaded: isAuthLoaded, user } = useAuthUser();
  const { isBrandScopeResolved, organizationId } = useBrand();
  const pathname = usePathname();
  const pageviewKey = `${user?.id ?? 'anonymous'}:${organizationId || 'no-organization'}:${pathname}`;
  const isInternal =
    user?.primaryEmailAddress?.emailAddress
      ?.trim()
      .toLowerCase()
      .endsWith('@genfeed.ai') === true;

  useEffect(() => {
    if (!isAuthLoaded) {
      return;
    }

    if (!user?.id) {
      return;
    }

    identifyAnalyticsUser({ id: user.id, isInternal });
  }, [isAuthLoaded, isInternal, user?.id]);

  useEffect(() => {
    if (!(isAuthLoaded && user?.id)) {
      return;
    }

    if (!isBrandScopeResolved) {
      return;
    }

    if (organizationId) {
      identifyAnalyticsOrganization(organizationId);
      return;
    }

    clearAnalyticsOrganization();
  }, [isAuthLoaded, isBrandScopeResolved, organizationId, user?.id]);

  useEffect(() => {
    if (!(isAuthLoaded && user?.id && isBrandScopeResolved)) {
      return;
    }

    captureAnalyticsPageview(pageviewKey, {
      app: resolveAnalyticsApp(pathname),
    });
  }, [isAuthLoaded, isBrandScopeResolved, pageviewKey, pathname, user?.id]);

  // Tag Sentry issues with the same person and organization PostHog sees.
  useEffect(() => {
    if (!(isAuthLoaded && isBrandScopeResolved)) {
      return;
    }

    setSentryAccountContext({
      organizationId: organizationId || undefined,
      userId: user?.id,
    });
  }, [isAuthLoaded, isBrandScopeResolved, organizationId, user?.id]);

  return null;
}

/** Synchronize authenticated scope before each protected route pageview. */
export default function AnalyticsOrganizationSync() {
  return isAnalyticsEnabled() ? <EnabledAnalyticsOrganizationSync /> : null;
}
