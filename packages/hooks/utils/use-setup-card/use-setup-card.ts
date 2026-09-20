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
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useEffect, useMemo, useState } from 'react';

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

  const [expertStatus, setExpertStatus] = useState<IExpertPathStatus | null>(
    null,
  );

  const getExpertPathService = useAuthedService((token: string) =>
    ExpertPathService.getInstance(token),
  );

  useEffect(() => {
    if (!isExpert || !isReady || !brandId) {
      setExpertStatus(null);
      return;
    }

    const controller = new AbortController();

    const loadExpertPathStatus = async () => {
      try {
        const service = await getExpertPathService();
        const status = await service.getStatus(brandId, controller.signal);

        if (!controller.signal.aborted) {
          setExpertStatus(status);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        logger.error('GET /expert-path failed', error);
      }
    };

    void loadExpertPathStatus();

    return () => controller.abort();
  }, [brandId, getExpertPathService, isExpert, isReady]);

  return useMemo(() => {
    const completedSteps = currentUser?.onboardingStepsCompleted ?? [];

    const stepHrefs: Record<string, string> = {
      platforms: '/settings/api-keys',
      preferences: '/settings/brands',
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
      href: stepHrefs[step.key] ?? `/settings/${step.key}`,
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
  }, [currentUser, expertStatus, hasPaygCredits, isExpert]);
}
