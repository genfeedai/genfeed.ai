'use client';

import Spinner from '@ui/primitives/spinner';
import OnboardingFrame from './onboarding-frame';
import OnboardingProgress from './onboarding-progress';

/**
 * What the prerendered shell shows before the wizard knows its steps. Their
 * count and labels depend on the account type, which only the client reads, so
 * the progress bar is held empty (#10886).
 */
export default function OnboardingShellFallback() {
  return (
    <OnboardingFrame
      progress={
        <div aria-busy="true" className="w-full">
          <OnboardingProgress currentStep={0} stepLabels={[]} totalSteps={2} />
        </div>
      }
    >
      <div className="flex justify-center py-16">
        <Spinner className="size-16 text-primary" />
      </div>
    </OnboardingFrame>
  );
}
