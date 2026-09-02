'use client';

import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { hasAgentFirstOnboarding } from '@genfeedai/config/deployment';
import {
  APP_ROUTES,
  ONBOARDING_STEPS,
  resolveForcedOnboardingHref,
} from '@genfeedai/contracts/constants';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Root /onboarding page — redirects to the first concrete onboarding step.
 */
export default function OnboardingRootPage() {
  const { currentUser, isLoading } = useCurrentUser();
  const { replace } = useRouter();

  useEffect(() => {
    if (isLoading || !currentUser) {
      return;
    }

    const completedSteps = currentUser.onboardingStepsCompleted ?? [];
    const hasCompletedAllOnboardingSteps =
      currentUser.isOnboardingCompleted === true ||
      ONBOARDING_STEPS.every((step) => completedSteps.includes(step));

    // An already-onboarded user who navigates to /onboarding replays brand
    // setup. Skip completes the gate so we do not force this again, but the
    // operator can come back whenever they want. Replaying is non-destructive:
    // the brand step updates the existing brand (never duplicates).
    if (hasCompletedAllOnboardingSteps) {
      replace(APP_ROUTES.ONBOARDING.BRAND);
      return;
    }

    replace(
      resolveForcedOnboardingHref({
        completedSteps,
        hasAgentFirstOnboarding: hasAgentFirstOnboarding(),
      }),
    );
  }, [currentUser, isLoading, replace]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="size-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );
}
