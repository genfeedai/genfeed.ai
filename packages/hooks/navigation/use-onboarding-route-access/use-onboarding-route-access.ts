'use client';

import {
  hasAgentFirstOnboarding,
  isCloudDeployment,
} from '@genfeedai/config/deployment';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  getBrandOrganizationAccountType,
  getBrandOrganizationSlug,
} from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import { MemberRole } from '@genfeedai/contracts';
import {
  getResumeStep,
  ONBOARDING_STEPS,
  resolveForcedOnboardingHref,
} from '@genfeedai/contracts/constants';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import { useMemo } from 'react';

export function useOnboardingRouteAccess(pathname: string) {
  // Admin `agent` flag (#5468): with Agent off, onboarding takes the classic wizard.
  const isAgentModuleEnabled = useFeatureFlag('agent');
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const { currentUser, isLoading: isUserLoading } = useCurrentUser();
  const {
    accessState,
    isLoading: isAccessStateLoading,
    isSubscribed,
    isSuperAdmin,
    needsOnboarding,
  } = useAccessState();
  const { selectedBrand, brands, isBrandScopeResolved } = useBrand();
  const hasNoBrandAccess =
    isCloudDeployment() &&
    isBrandScopeResolved &&
    brands.length === 0 &&
    Boolean(accessState?.memberRole) &&
    accessState?.memberRole !== MemberRole.OWNER &&
    accessState?.memberRole !== MemberRole.ADMIN;
  const brand = selectedBrand ?? brands[0];
  const isOnboardingRoute = pathname.startsWith('/onboarding');

  const redirectTarget = useMemo(() => {
    if (!effectiveIsAuthLoaded) {
      return null;
    }

    if (!effectiveIsSignedIn) {
      return '/login';
    }

    if (isUserLoading || isAccessStateLoading || !currentUser) {
      return null;
    }

    // Agent-first onboarding is the /agent/onboarding conversation. Waiting on
    // accessState here deadlocks first-login users whose brand context has not
    // resolved an organizationId yet — the access query never enables, this
    // guard spins forever, and the agent surface never mounts.
    if (!accessState) {
      return null;
    }

    if (hasNoBrandAccess) return null;

    if (needsOnboarding) {
      if (currentUser.isOnboardingCompleted === true) {
        return null;
      }

      if (isOnboardingRoute) {
        return null;
      }

      if (hasAgentFirstOnboarding(isAgentModuleEnabled)) {
        const href = resolveForcedOnboardingHref({
          accountType: getBrandOrganizationAccountType(brand),
          completedSteps: currentUser.onboardingStepsCompleted,
          hasAgentFirstOnboarding: true,
          orgSlug: getBrandOrganizationSlug(brand),
        });
        return pathname === href || pathname.startsWith(`${href}/`)
          ? null
          : href;
      }

      if (isSuperAdmin || isSubscribed) {
        return null;
      }

      const completedSteps = currentUser.onboardingStepsCompleted ?? [];
      const hasCompletedAllOnboardingSteps = ONBOARDING_STEPS.every((step) =>
        completedSteps.includes(step),
      );

      if (hasCompletedAllOnboardingSteps) {
        return '/onboarding/summary';
      }

      const resumeStep = getResumeStep(currentUser.onboardingStepsCompleted);
      return `/onboarding/${resumeStep}`;
    }

    // Funnel: signup -> onboarding (above) -> the app. Running out of credits
    // never locks routes: Library, Brand Kit and settings stay readable so the
    // org can see what it made. Credit-spending actions are refused by the API
    // and answered with the credits prompt (ModalEnum.CREDITS_REQUIRED).
    return null;
  }, [
    accessState,
    hasNoBrandAccess,
    brand,
    pathname,
    currentUser,
    effectiveIsAuthLoaded,
    effectiveIsSignedIn,
    isAccessStateLoading,
    isOnboardingRoute,
    isSubscribed,
    isSuperAdmin,
    isUserLoading,
    needsOnboarding,
    isAgentModuleEnabled,
  ]);

  const canRenderWithoutAccessState =
    hasAgentFirstOnboarding(isAgentModuleEnabled);

  const canRender = !(
    !effectiveIsAuthLoaded ||
    isUserLoading ||
    isAccessStateLoading ||
    !currentUser ||
    redirectTarget ||
    (!accessState && !canRenderWithoutAccessState)
  );

  return { canRender, redirectTarget };
}
