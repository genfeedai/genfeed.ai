'use client';

import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { getResumeStep, ONBOARDING_STEPS } from '@genfeedai/constants';
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
      replace('/onboarding/proactive');
      return;
    }

    const completedSteps = currentUser.onboardingStepsCompleted ?? [];
    const hasCompletedAllOnboardingSteps = ONBOARDING_STEPS.every((step) =>
      completedSteps.includes(step),
    );

    if (hasCompletedAllOnboardingSteps) {
      replace('/onboarding/summary');
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
