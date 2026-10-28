'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { PostStatus } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createPublishingPostsFilterRoute,
} from '@genfeedai/contracts/constants';
import type { CompleteOnboardingOptions } from '@genfeedai/props/onboarding/complete-onboarding.props';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { useCallback } from 'react';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';

/**
 * Finish the onboarding gate and enter the brand workspace. Shared by the
 * classic success step and the Expert Path `first-system` step.
 */
export function useCompleteOnboarding(): (
  options?: CompleteOnboardingOptions,
) => Promise<void> {
  const { getToken } = useAuthIdentity();
  const { user } = useAuthUser();
  const { selectedBrand } = useBrand();
  const { currentUser } = useCurrentUser();
  const isReplay = currentUser?.isOnboardingCompleted === true;

  return useCallback(
    async (options: CompleteOnboardingOptions = {}) => {
      // Onboarding completion is a field write on the user resource; the
      // proactive + cache-invalidation cascade lives behind PATCH /users/me.
      //
      // `onboarding_completed` is captured server-side by
      // `UsersController#completeOnboardingFunnel`, gated on actually winning
      // the atomic isOnboardingCompleted false->true claim — not here.
      // Capturing it unconditionally on every successful response (as this
      // hook used to) double-emitted the funnel event whenever two wizard tabs
      // raced, or the agent-first onboarding path completed first and this
      // PATCH later found the user already onboarded (genfeedai/genfeed.ai#5311).
      //
      // A replay by an already-onboarded user writes nothing: the completion
      // claim, its funnel event and the finished-onboarding announcement all
      // already happened.
      if (!isReplay) {
        try {
          const token = await resolveAuthToken(getToken, {
            forceRefresh: true,
          });
          if (!token) throw new Error('Authentication is unavailable');
          await UsersService.getInstance(token).patchMe({
            isOnboardingCompleted: true,
          });
          await user?.reload();
        } catch (error) {
          logger.error('Failed to complete funnel', error);
          throw error;
        }
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

      const scopedPath = options.isLandingOnDrafts
        ? createPublishingPostsFilterRoute({ status: PostStatus.DRAFT })
        : '/workspace';
      window.location.assign(
        orgSlug && brandSlug
          ? createBrandAppRoute(orgSlug, brandSlug, scopedPath)
          : options.isLandingOnDrafts
            ? scopedPath
            : APP_ROUTES.WORKSPACE.OVERVIEW,
      );
    },
    [getToken, isReplay, selectedBrand, user],
  );
}
