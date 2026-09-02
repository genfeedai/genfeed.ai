'use client';

import {
  hasAgentFirstOnboarding,
  isDesktopClient,
} from '@genfeedai/config/deployment';
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
import type { OnboardingGuardProps } from '@genfeedai/props/guards/onboarding-guard.props';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

/**
 * - If onboarding not completed → redirect to first incomplete step
 * - If onboarding completed but billing is required in EE mode and the org
 *   still lacks subscription state → redirect to the final onboarding step
 * - Otherwise → pass through
 */
function OnboardingGuardInner({ children }: OnboardingGuardProps) {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const { currentUser, isLoading: isUserLoading } = useCurrentUser();
  const {
    accessState,
    hasPaygCredits,
    isByok,
    isLoading: isAccessStateLoading,
    isSubscribed,
    isSuperAdmin,
    needsOnboarding,
  } = useAccessState();
  const { replace } = useRouter();
  const pathname = usePathname();
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

      if (isSuperAdmin || isSubscribed || isByok) {
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

    if (
      isBillingEnabled &&
      !isSuperAdmin &&
      !isSubscribed &&
      !isByok &&
      !hasPaygCredits
    ) {
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
    isByok,
    isOnboardingRoute,
    isSubscribed,
    isSuperAdmin,
    isUserLoading,
    needsOnboarding,
  ]);

  useEffect(() => {
    if (redirectTarget) {
      replace(redirectTarget);
    }
  }, [redirectTarget, replace]);

  const canRenderWithoutAccessState = hasAgentFirstOnboarding();

  if (
    !effectiveIsAuthLoaded ||
    isUserLoading ||
    isAccessStateLoading ||
    !currentUser ||
    redirectTarget ||
    (!accessState && !canRenderWithoutAccessState)
  ) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="size-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * OnboardingGuard
 *
 * Desktop offline mode bypasses the cloud onboarding gate; web routes use the
 * DB-backed access state loaded by protected providers.
 */
export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  // Desktop shell without a cloud session → offline mode, skip onboarding gate.
  if (isDesktopClient()) {
    return <>{children}</>;
  }

  return <OnboardingGuardInner>{children}</OnboardingGuardInner>;
}
