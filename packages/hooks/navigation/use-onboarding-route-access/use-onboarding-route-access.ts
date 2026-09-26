'use client';

import { hasAgentFirstOnboarding } from '@genfeedai/config/deployment';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import {
  APP_ROUTES,
  getResumeStep,
  hasCompletedBrandOnboardingStep,
  ONBOARDING_STEPS,
} from '@genfeedai/contracts/constants';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useMemo } from 'react';

export function useOnboardingRouteAccess(pathname: string) {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const { currentUser, isLoading: isUserLoading } = useCurrentUser();
  const {
    accessState,
    hasPaygCredits,
    isLoading: isAccessStateLoading,
    isSubscribed,
    isSuperAdmin,
    needsOnboarding,
  } = useAccessState();
  const isOnboardingRoute = pathname.startsWith('/onboarding');
  const isBillingEnabled = hasOrganizationBillingHint();

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

    if (needsOnboarding) {
      if (currentUser.isOnboardingCompleted === true) {
        return null;
      }

      if (isOnboardingRoute) {
        return null;
      }

      // Cloud / Community share `/onboarding/brand` with Desktop. After that
      // step the agent workspace owns the rest of first-run; this guard must
      // not pull those users into providers/summary.
      if (hasAgentFirstOnboarding()) {
        if (
          !hasCompletedBrandOnboardingStep(currentUser.onboardingStepsCompleted)
        ) {
          return APP_ROUTES.ONBOARDING.BRAND;
        }

        return null;
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

    if (isBillingEnabled && !isSuperAdmin && !isSubscribed && !hasPaygCredits) {
      return '/onboarding/summary';
    }

    return null;
  }, [
    accessState,
    currentUser,
    effectiveIsAuthLoaded,
    effectiveIsSignedIn,
    hasPaygCredits,
    isAccessStateLoading,
    isBillingEnabled,
    isOnboardingRoute,
    isSubscribed,
    isSuperAdmin,
    isUserLoading,
    needsOnboarding,
  ]);

  const canRenderWithoutAccessState = hasAgentFirstOnboarding();

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
