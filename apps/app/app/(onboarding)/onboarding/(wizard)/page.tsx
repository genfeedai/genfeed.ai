'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationAccountType } from '@contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { hasSingleStepOnboarding } from '@genfeedai/config/deployment';
import {
  ONBOARDING_STEPS,
  resolveForcedOnboardingHref,
} from '@genfeedai/contracts/constants';
import Spinner from '@ui/primitives/spinner';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Root /onboarding page — redirects to the first unfinished onboarding step.
 * A user who already finished onboarding replays the flow from its first step
 * (the replay never generates or grants anything, see `useFirstDrafts`).
 */
export default function OnboardingRootPage() {
  const { currentUser, isLoading } = useCurrentUser();
  const { selectedBrand, brands, isBrandScopeResolved } = useBrand();
  const { replace } = useRouter();

  useEffect(() => {
    if (isLoading || !currentUser || !isBrandScopeResolved) {
      return;
    }

    const isReplay = currentUser.isOnboardingCompleted === true;
    const completedSteps = isReplay
      ? []
      : (currentUser.onboardingStepsCompleted ?? []);

    if (ONBOARDING_STEPS.every((step) => completedSteps.includes(step))) {
      replace('/');
      return;
    }

    replace(
      resolveForcedOnboardingHref({
        accountType: getBrandOrganizationAccountType(
          selectedBrand ?? brands[0],
        ),
        completedSteps,
        hasSingleStepOnboarding: hasSingleStepOnboarding(),
      }),
    );
  }, [
    currentUser,
    isLoading,
    replace,
    selectedBrand,
    brands,
    isBrandScopeResolved,
  ]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner className="size-6 text-foreground" />
    </div>
  );
}
