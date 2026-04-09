'use client';

import { useUser } from '@clerk/nextjs';
import { SETUP_CARD_STEPS } from '@genfeedai/constants';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import type { IClerkPublicData } from '@genfeedai/interfaces';
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
  const { user: clerkUser } = useUser();

  return useMemo(() => {
    const completedSteps = currentUser?.onboardingStepsCompleted ?? [];
    const publicData = (clerkUser?.publicMetadata ??
      {}) as unknown as IClerkPublicData;
    const hasEverHadCredits = publicData.hasEverHadCredits === true;

    const stepHrefs: Record<string, string> = {
      platforms: '/settings/organization/credentials',
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

    const isVisible = !hasEverHadCredits && !allCompleted;

    return {
      completedCount,
      isVisible,
      steps,
      totalCount,
    };
  }, [currentUser, clerkUser]);
}
