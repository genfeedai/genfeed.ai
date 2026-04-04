'use client';

import { ModalEnum } from '@genfeedai/enums';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import {
  OnboardingService,
  type OnboardingStatusResponse,
} from '@services/onboarding/onboarding.service';
import { useCallback, useEffect, useState } from 'react';

export interface UseOnboardingReturn {
  isLoading: boolean;
  isFirstLogin: boolean;
  hasCompletedOnboarding: boolean;
  openOnboarding: () => void;
  checkOnboardingStatus: () => Promise<void>;
}

/**
 * Hook to manage onboarding state and trigger onboarding modal
 *
 * Usage:
 * ```tsx
 * const { isFirstLogin, openOnboarding } = useOnboarding();
 *
 * useEffect(() => {
 *   if (isFirstLogin) {
 *     openOnboarding();
 *   }
 * }, [isFirstLogin]);
 * ```
 */
export function useOnboarding(): UseOnboardingReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<OnboardingStatusResponse>({
    hasCompletedOnboarding: true,
    isFirstLogin: false,
  });

  const getOnboardingService = useAuthedService((token: string) =>
    OnboardingService.getInstance(token),
  );

  const checkOnboardingStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const service = await getOnboardingService();
      const result = await service.getStatus();
      setStatus(result);
      logger.info('Onboarding status fetched', result);
    } catch (error) {
      logger.error('Failed to fetch onboarding status', error);
      // On error, assume user has completed onboarding to avoid blocking
      setStatus({
        hasCompletedOnboarding: true,
        isFirstLogin: false,
      });
    } finally {
      setIsLoading(false);
    }
  }, [getOnboardingService]);

  const openOnboarding = useCallback(() => {
    openModal(ModalEnum.ONBOARDING);
  }, []);

  // Check status on mount
  useEffect(() => {
    checkOnboardingStatus();
  }, [checkOnboardingStatus]);

  return {
    checkOnboardingStatus,
    hasCompletedOnboarding: status.hasCompletedOnboarding,
    isFirstLogin: status.isFirstLogin,
    isLoading,
    openOnboarding,
  };
}
