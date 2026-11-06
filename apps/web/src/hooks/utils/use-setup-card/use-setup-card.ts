'use client';

import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandOrganizationAccountType } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import {
  APP_ROUTES,
  EXPERT_SETUP_CARD_STEPS,
  isExpertAccountType,
  SETUP_CARD_STEPS,
} from '@genfeedai/contracts/constants';
import type { IExpertPathStatus } from '@genfeedai/contracts/interfaces';
import { ExpertPathService } from '@genfeedai/services/content/expert-path.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
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

const EXPERT_STEP_HREFS: Record<
  (typeof EXPERT_SETUP_CARD_STEPS)[number]['key'],
  string
> = {
  corpus: APP_ROUTES.ONBOARDING.CORPUS,
  'first-system': APP_ROUTES.ONBOARDING.FIRST_SYSTEM,
  positioning: APP_ROUTES.ONBOARDING.POSITIONING,
};

function isExpertStepCompleted(
  key: (typeof EXPERT_SETUP_CARD_STEPS)[number]['key'],
  status: IExpertPathStatus | null,
): boolean {
  if (!status) {
    return false;
  }

  if (key === 'positioning') {
    return status.positioning.isComplete;
  }

  if (key === 'corpus') {
    return status.corpus.isComplete;
  }

  return status.firstSystem.status === 'generated';
}

export function useSetupCard(): UseSetupCardReturn {
  const { currentUser } = useCurrentUser();
  const { hasPaygCredits } = useAccessState();
  const { brandId, isReady, selectedBrand } = useBrand();
  const isExpert = isExpertAccountType(
    getBrandOrganizationAccountType(selectedBrand),
  );

  const { activeHref, orgHref } = useOrgUrl();

  // Cached per brand: coming back to Settings shows the Expert Path progress
  // at once while it refreshes.
  const isExpertStatusEnabled = isExpert && isReady && Boolean(brandId);
  const expertStatusQuery = useAuthedQuery({
    enabled: isExpertStatusEnabled,
    queryFn: async (service, signal) => {
      try {
        return await service.getStatus(brandId, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /expert-path failed', error);
        }
        throw error;
      }
    },
    queryKey: ['expert-path-status', brandId],
    service: (token: string) => ExpertPathService.getInstance(token),
  });
  const expertStatus: IExpertPathStatus | null = isExpertStatusEnabled
    ? (expertStatusQuery.data ?? null)
    : null;

  return useMemo(() => {
    const completedSteps = currentUser?.onboardingStepsCompleted ?? [];

    const stepHrefs: Record<(typeof SETUP_CARD_STEPS)[number]['key'], string> =
      {
        platforms: activeHref(APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS),
        preferences: orgHref(APP_ROUTES.SETTINGS.BRANDS),
      };

    const expertSteps: SetupCardStep[] = isExpert
      ? EXPERT_SETUP_CARD_STEPS.map((step) => ({
          description: step.description,
          href: EXPERT_STEP_HREFS[step.key],
          isCompleted: isExpertStepCompleted(step.key, expertStatus),
          key: step.key,
          label: step.label,
        }))
      : [];

    const accountSteps: SetupCardStep[] = SETUP_CARD_STEPS.map((step) => ({
      description: step.description,
      href: stepHrefs[step.key],
      isCompleted: completedSteps.includes(step.key),
      key: step.key,
      label: step.label,
    }));

    const steps = [...expertSteps, ...accountSteps];

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
  }, [
    activeHref,
    currentUser,
    expertStatus,
    hasPaygCredits,
    isExpert,
    orgHref,
  ]);
}
