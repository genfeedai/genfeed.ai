'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { PostStatus } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createPublishingPostsFilterRoute,
} from '@genfeedai/contracts/constants';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { AuthService } from '@services/auth/auth.service';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { useCallback } from 'react';
import type { CompleteOnboardingOptions } from '@/features/onboarding/props/complete-onboarding.props';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';

/**
 * Where a finished onboarding lands in the brand workspace: its drafts when
 * the onboarding made some, else the workspace overview.
 */
export function resolveOnboardingExitHref(
  brand: IBrand | null | undefined,
  isLandingOnDrafts = false,
): string {
  const org = brand?.organization;
  const orgSlug =
    org && typeof org === 'object' && 'slug' in org
      ? (org as { slug: string }).slug
      : '';
  const brandSlug = brand?.slug ?? '';
  const scopedPath = isLandingOnDrafts
    ? createPublishingPostsFilterRoute({ status: PostStatus.DRAFT })
    : '/workspace';
  return orgSlug && brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, scopedPath)
    : APP_ROUTES.WORKSPACE.OVERVIEW;
}

/**
 * Whether the organization never paid, read from the access bootstrap. Only a
 * billing deployment asks; a failed read answers false, since the API refuses
 * an unpaid publish on its own and the plan choice is not the gate.
 */
export async function readIsNeverPaid(token: string): Promise<boolean> {
  if (!hasOrganizationBillingHint()) return false;
  try {
    const { access } = await AuthService.getInstance(token).getBootstrap();
    return access.trialEndsAt != null && access.isSuperAdmin !== true;
  } catch (error) {
    logger.error('Failed to read whether the organization paid', error);
    return false;
  }
}

/**
 * Finish the onboarding gate and enter the brand workspace, or the plan and
 * credits choice for an organization that never paid. Shared by the
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
      let isNeverPaid = false;
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
          isNeverPaid = await readIsNeverPaid(token);
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

      // Cloud has no free tier: an organization that never paid leaves the
      // onboarding on the plan and credits choice. Its drafts stay readable.
      window.location.assign(
        isNeverPaid
          ? APP_ROUTES.ONBOARDING.PLANS
          : resolveOnboardingExitHref(selectedBrand, options.isLandingOnDrafts),
      );
    },
    [getToken, isReplay, selectedBrand, user],
  );
}
