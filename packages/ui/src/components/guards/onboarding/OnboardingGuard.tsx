'use client';

import { getResumeStep, ONBOARDING_STEPS } from '@genfeedai/constants';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
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
  const { brandId, organizationId } = useBrand();
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
      const hasExistingWorkspace =
        (typeof organizationId === 'string' &&
          organizationId.length > 0 &&
          typeof brandId === 'string' &&
          brandId.length > 0) ||
        (typeof accessState.organizationId === 'string' &&
          accessState.organizationId.length > 0 &&
          typeof accessState.brandId === 'string' &&
          accessState.brandId.length > 0);

      if (!isOnboardingRoute && hasExistingWorkspace) {
        return null;
      }

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
    brandId,
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
    organizationId,
  ]);

  useEffect(() => {
    if (redirectTarget) {
      replace(redirectTarget);
    }
  }, [redirectTarget, replace]);

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
        <div className="size-6 border-2 border-neutral-300 border-t-neutral-700 rounded-full animate-spin dark:border-neutral-600 dark:border-t-neutral-300" />
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
  if (process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1') {
    return <>{children}</>;
  }

  return <OnboardingGuardInner>{children}</OnboardingGuardInner>;
}
