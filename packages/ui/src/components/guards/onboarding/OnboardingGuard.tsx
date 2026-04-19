'use client';

import { useAuth } from '@clerk/nextjs';
import { getResumeStep, ONBOARDING_STEPS } from '@genfeedai/constants';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/clerk.helper';
import type { OnboardingGuardProps } from '@genfeedai/props/guards/onboarding-guard.props';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

/**
 * Clerk-dependent guard logic. Only rendered when Clerk keys are present.
 *
 * - If onboarding not completed → redirect to first incomplete step
 * - If onboarding completed but billing is required in EE mode and the org
 *   still lacks subscription state → redirect to the final onboarding step
 * - Otherwise → pass through
 */
function OnboardingGuardInner({ children }: OnboardingGuardProps) {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
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

/**
 * OnboardingGuard
 *
 * In LOCAL mode (no Clerk keys), SelfHostedSeedService sets isOnboardingCompleted=true on boot,
 * so the guard is skipped entirely. Without this bypass, effectiveIsSignedIn=false in LOCAL mode
 * causes an infinite redirect loop: /login → workspace → /login.
 *
 * In Clerk mode, delegates to OnboardingGuardInner which runs the full redirect logic.
 */
export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  // No Clerk keys → self-hosted mode, seed service handles onboarding state.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <>{children}</>;
  }

  // Desktop shell without a cloud session → offline mode, skip onboarding gate.
  if (process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1') {
    return <>{children}</>;
  }

  return <OnboardingGuardInner>{children}</OnboardingGuardInner>;
}
