'use client';

import { useCurrentUser } from '@contexts/user/user-context/user-context';
import {
  APP_ROUTES,
  getResumeStep,
  ONBOARDING_STEPS,
} from '@genfeedai/constants';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Root /onboarding page — redirects to the first concrete onboarding step.
 */
export default function OnboardingRootPage() {
  const { currentUser, isLoading } = useCurrentUser();
  const { user: authUser, isLoaded: isAuthLoaded } = useAuthUser();
  const { replace } = useRouter();

  useEffect(() => {
    if (isLoading || !currentUser || !isAuthLoaded) {
      return;
    }

    if (authUser?.publicMetadata?.proactiveLeadId) {
      replace(APP_ROUTES.ONBOARDING.PROACTIVE);
      return;
    }

    const completedSteps = currentUser.onboardingStepsCompleted ?? [];
    const hasCompletedAllOnboardingSteps = ONBOARDING_STEPS.every((step) =>
      completedSteps.includes(step),
    );

    // An already-onboarded user who navigates to /onboarding replays the full
    // wizard from the first step rather than jumping to the summary. Replaying
    // is non-destructive: the brand step updates the existing brand (never
    // duplicates) and the summary step only persists an access preference.
    // Mid-onboarding users still resume at their first incomplete step.
    if (hasCompletedAllOnboardingSteps) {
      replace(APP_ROUTES.ONBOARDING.BRAND);
      return;
    }

    replace(`/onboarding/${getResumeStep(completedSteps)}`);
  }, [authUser, currentUser, isAuthLoaded, isLoading, replace]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="size-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
}
