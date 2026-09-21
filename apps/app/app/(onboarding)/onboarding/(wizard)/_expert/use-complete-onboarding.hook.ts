'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { useCallback } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';

/**
 * Finish the onboarding gate and enter the brand workspace. Shared by the
 * classic success step and the Expert Path `first-system` step.
 */
export function useCompleteOnboarding(): () => Promise<void> {
  const { getToken } = useAuthIdentity();
  const { user } = useAuthUser();
  const { selectedBrand } = useBrand();

  return useCallback(async () => {
    // Onboarding completion is a field write on the user resource; the
    // proactive + cache-invalidation cascade lives behind PATCH /users/me.
    try {
      const token = await resolveAuthToken(getToken, { forceRefresh: true });
      if (token) {
        await UsersService.getInstance(token).patchMe({
          isOnboardingCompleted: true,
        });
        captureAnalyticsEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {});
      }
      await user?.reload();
    } catch (error) {
      logger.error('Failed to complete funnel', error);
    }

    for (const key of [
      ONBOARDING_STORAGE_KEYS.previewUrl,
      ONBOARDING_STORAGE_KEYS.brandDomain,
      ONBOARDING_STORAGE_KEYS.brandName,
      ONBOARDING_STORAGE_KEYS.accessMode,
      ONBOARDING_STORAGE_KEYS.accountType,
      ONBOARDING_STORAGE_KEYS.source,
      ONBOARDING_STORAGE_KEYS.contentType,
    ]) {
      localStorage.removeItem(key);
    }

    const org = selectedBrand?.organization;
    const orgSlug =
      org && typeof org === 'object' && 'slug' in org
        ? (org as { slug: string }).slug
        : '';
    const brandSlug = selectedBrand?.slug ?? '';

    window.location.assign(
      orgSlug && brandSlug
        ? createBrandAppRoute(orgSlug, brandSlug, '/workspace')
        : APP_ROUTES.WORKSPACE.OVERVIEW,
    );
  }, [getToken, selectedBrand, user]);
}
