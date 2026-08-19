'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthUser } from '@hooks/auth/use-auth-user';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  captureAnalyticsPageview,
  clearAnalyticsOrganization,
  identifyAnalyticsOrganization,
  identifyAnalyticsUser,
} from '@/lib/analytics';

/** Synchronize authenticated scope before each protected route pageview. */
export default function AnalyticsOrganizationSync() {
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
      clearAnalyticsOrganization();
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

    captureAnalyticsPageview(pageviewKey);
  }, [isAuthLoaded, isBrandScopeResolved, pageviewKey, user?.id]);

  return null;
}
