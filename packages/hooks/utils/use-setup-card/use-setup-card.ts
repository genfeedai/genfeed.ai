'use client';

import { SETUP_CARD_STEPS } from '@genfeedai/constants';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import { useMemo } from 'react';

export interface SetupCardStep {
  key: string;
  label: string;
  description: string;
  href: string;
  isCompleted: boolean;
}

export interface UseSetupCardReturn {
  isVisible: boolean;
  steps: SetupCardStep[];
  completedCount: number;
  totalCount: number;
}

export function useSetupCard(): UseSetupCardReturn {
  const { currentUser } = useCurrentUser();
  const { hasPaygCredits } = useAccessState();

  return useMemo(() => {
    const completedSteps = currentUser?.onboardingStepsCompleted ?? [];

    const stepHrefs: Record<string, string> = {
      platforms: '/settings/api-keys',
      preferences: '/settings/brands',
    };

    const steps: SetupCardStep[] = SETUP_CARD_STEPS.map((step) => ({
      description: step.description,
      href: stepHrefs[step.key] ?? `/settings/${step.key}`,
      isCompleted: completedSteps.includes(step.key),
      key: step.key,
      label: step.label,
    }));

    const completedCount = steps.filter((s) => s.isCompleted).length;
    const totalCount = steps.length;
    const allCompleted = completedCount === totalCount;

    const isVisible = !hasPaygCredits && !allCompleted;

    return {
      completedCount,
      isVisible,
      steps,
      totalCount,
    };
  }, [currentUser, hasPaygCredits]);
}
