'use client';

import { useAuth } from '@clerk/nextjs';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { getResumeStep, ONBOARDING_STEPS } from '@genfeedai/constants';
import { getPlaywrightAuthState } from '@helpers/auth/clerk.helper';
import type { OnboardingGuardProps } from '@props/guards/onboarding-guard.props';
import { useAccessState } from '@providers/access-state/access-state.provider';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

/**
 * OnboardingGuard
 *
 * Consolidated guard that checks onboarding completion and, in EE mode only,
 * keeps billing-era gating behavior.
 *
 * - If onboarding not completed → redirect to first incomplete step
 * - If onboarding completed but billing is required in EE mode and the org
 *   still lacks subscription state → redirect to the final onboarding step
 * - Otherwise → pass through
 */
export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
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
  const router = useRouter();
  const pathname = usePathname();
  const isOnboardingRoute = pathname.startsWith('/onboarding');
  const isBillingEnabled = Boolean(process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY);

  const redirectTarget = useMemo(() => {
    if (!effectiveIsAuthLoaded) {
      return null;
    }

    if (!effectiveIsSignedIn) {
      return '/login';
    }

    if (isUserLoading || isAccessStateLoading || !currentUser || !accessState) {
      return null;
    }

    if (needsOnboarding) {
      if (isOnboardingRoute) {
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
        return '/onboarding/providers';
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
      return '/onboarding/providers';
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
      router.replace(redirectTarget);
    }
  }, [redirectTarget, router]);

  if (
    !effectiveIsAuthLoaded ||
    isUserLoading ||
    isAccessStateLoading ||
    !currentUser ||
    !accessState ||
    redirectTarget
  ) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-700 rounded-full animate-spin dark:border-neutral-600 dark:border-t-neutral-300" />
      </div>
    );
  }

  return <>{children}</>;
}
