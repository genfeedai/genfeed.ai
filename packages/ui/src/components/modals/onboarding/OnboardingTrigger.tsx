'use client';

import { ModalEnum } from '@genfeedai/enums';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useOnboarding } from '@genfeedai/hooks/utils/use-onboarding/use-onboarding';
import ModalOnboarding from '@ui/modals/onboarding/ModalOnboarding';
import { useEffect, useRef } from 'react';

/**
 * OnboardingTrigger
 *
 * Checks if user needs onboarding and opens the modal automatically.
 * Include this component in your protected layout to enable onboarding.
 *
 * Usage:
 * ```tsx
 * // In your protected layout
 * <OnboardingTrigger />
 * ```
 */
const ONBOARDING_DISMISSED_KEY = 'genfeed:onboarding-dismissed';

export default function OnboardingTrigger() {
  const { isFirstLogin, isLoading, checkOnboardingStatus } = useOnboarding();
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    // Only trigger once per mount, after loading completes, and if not previously dismissed
    if (!isLoading && isFirstLogin && !hasTriggeredRef.current) {
      const wasDismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY);
      if (wasDismissed) {
        return;
      }

      hasTriggeredRef.current = true;
      // Small delay to ensure app is fully rendered
      const timer = setTimeout(() => {
        openModal(ModalEnum.ONBOARDING);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [isLoading, isFirstLogin]);

  const markDismissed = () => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
  };

  const handleComplete = () => {
    markDismissed();
    checkOnboardingStatus();
  };

  const handleSkip = () => {
    markDismissed();
    checkOnboardingStatus();
  };

  return (
    <ModalOnboarding
      isOpen={false}
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  );
}
