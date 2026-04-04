'use client';

import { useAuth } from '@clerk/nextjs';
import type { IOnboardingContextValue } from '@cloud/interfaces';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import type { OnboardingStepKey } from '@genfeedai/constants';
import { ONBOARDING_STEP_LABELS, ONBOARDING_STEPS } from '@genfeedai/constants';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import type { OnboardingProviderProps } from '@props/onboarding/onboarding-provider.props';
import { logger } from '@services/core/logger.service';
import type { UpdateUserOnboardingPayload } from '@services/onboarding/user-onboarding.service';
import { UserOnboardingService } from '@services/onboarding/user-onboarding.service';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const OnboardingContext = createContext<IOnboardingContextValue | null>(null);

export function useOnboarding(): IOnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}

export default function OnboardingProvider({
  children,
}: OnboardingProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { getToken } = useAuth();
  const { currentUser, isLoading, refetchUser } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Derive current step from URL — success page bypasses step tracking
  const currentStepKey = useMemo<OnboardingStepKey>(() => {
    const segment = pathname.split('/').pop();
    if (segment && ONBOARDING_STEPS.includes(segment as OnboardingStepKey)) {
      return segment as OnboardingStepKey;
    }
    return 'brand';
  }, [pathname]);

  const currentStepIndex = Math.max(
    0,
    ONBOARDING_STEPS.indexOf(currentStepKey),
  );

  useEffect(() => {
    if (!isLoading && currentUser) {
      setInitialized(true);
    }
  }, [isLoading, currentUser]);

  const getService = useCallback(async () => {
    const token = await resolveClerkToken(getToken);
    if (!token) {
      throw new Error('Not authenticated');
    }
    return UserOnboardingService.getInstance(token);
  }, [getToken]);

  const saveProgress = useCallback(
    async (payload: UpdateUserOnboardingPayload) => {
      if (!currentUser) {
        return;
      }
      setSaving(true);
      try {
        const service = await getService();
        await service.updateOnboarding(currentUser.id, payload);
        await refetchUser();
      } catch (error) {
        logger.error('Failed to save onboarding progress', error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [currentUser, getService, refetchUser],
  );

  const handleStepComplete = useCallback(
    async (
      stepKey: OnboardingStepKey,
      extraPayload?: Partial<UpdateUserOnboardingPayload>,
    ) => {
      const completedSteps = [...(currentUser?.onboardingStepsCompleted ?? [])];
      if (!completedSteps.includes(stepKey)) {
        completedSteps.push(stepKey);
      }

      const payload: UpdateUserOnboardingPayload = {
        onboardingStepsCompleted: completedSteps,
        ...extraPayload,
      };

      await saveProgress(payload);

      // Navigate to next step
      const stepIdx = ONBOARDING_STEPS.indexOf(stepKey);
      if (stepIdx < ONBOARDING_STEPS.length - 1) {
        const nextStep = ONBOARDING_STEPS[stepIdx + 1];
        router.push(`/onboarding/${nextStep}`);
      } else {
        router.replace('/');
      }
    },
    [currentUser, saveProgress, router],
  );

  const handleSkip = useCallback(
    async (stepKey: OnboardingStepKey) => {
      await handleStepComplete(stepKey);
    },
    [handleStepComplete],
  );

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      const prevStep = ONBOARDING_STEPS[currentStepIndex - 1];
      router.push(`/onboarding/${prevStep}`);
    }
  }, [currentStepIndex, router]);

  const stepLabels = useMemo(
    () => ONBOARDING_STEPS.map((key) => ONBOARDING_STEP_LABELS[key]),
    [],
  );

  const value = useMemo<IOnboardingContextValue>(
    () => ({
      currentStepIndex,
      currentStepKey,
      handleBack,
      handleSkip,
      handleStepComplete,
      saving,
      stepLabels,
    }),
    [
      currentStepIndex,
      currentStepKey,
      handleBack,
      handleSkip,
      handleStepComplete,
      saving,
      stepLabels,
    ],
  );

  if (isLoading || !initialized) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}
