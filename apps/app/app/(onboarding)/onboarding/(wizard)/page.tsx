'use client';

import { useUser } from '@clerk/nextjs';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { getResumeStep, ONBOARDING_STEPS } from '@genfeedai/constants';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Root /onboarding page — redirects to the first concrete onboarding step.
 */
export default function OnboardingRootPage() {
  const { currentUser, isLoading } = useCurrentUser();
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  const { replace } = useRouter();

  useEffect(() => {
    if (isLoading || !currentUser || !isClerkLoaded) {
      return;
    }

    if (clerkUser?.publicMetadata?.proactiveLeadId) {
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
  }, [clerkUser, currentUser, isClerkLoaded, isLoading, replace]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="size-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
}
