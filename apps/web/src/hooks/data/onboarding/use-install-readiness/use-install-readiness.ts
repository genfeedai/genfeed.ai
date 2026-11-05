'use client';

import type { OnboardingAccessMode } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { logger } from '@services/core/logger.service';
import {
  type InstallReadinessResponse,
  OnboardingService,
} from '@services/onboarding/onboarding.service';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/** Shared by the Providers and Summary onboarding steps. */
export const INSTALL_READINESS_QUERY_KEY = ['onboarding-install-readiness'];

/** What the steps render until the install readiness first arrives. */
export const EMPTY_INSTALL_READINESS: InstallReadinessResponse = {
  access: {
    byokConfiguredProviders: [],
    byokEnabled: false,
    runtimeMode: 'server',
    selectedMode: null,
    serverDefaultsReady: false,
  },
  authMode: 'better_auth',
  billingMode: 'oss_local',
  localTools: {
    anyDetected: false,
    claude: false,
    codex: false,
    detected: [],
  },
  providers: {
    anyConfigured: false,
    configured: [],
    fal: false,
    imageGenerationReady: false,
    openai: false,
    openrouter: false,
    replicate: false,
    textGenerationReady: false,
  },
  ui: {
    showBilling: false,
    showCloudUpgradeCta: true,
    showCredits: false,
    showLocalTools: false,
    showPricing: false,
  },
  workspace: {
    brandId: null,
    hasBrand: false,
    hasOrganization: false,
    organizationId: null,
  },
};

/**
 * The install's provider, tool and access readiness. Cached, so moving
 * between the Providers and Summary steps paints it at once while it
 * refreshes. `markAccessModeSaved` writes a saved access choice into the
 * cache, so the next step never shows the previous choice as saved.
 */
export function useInstallReadiness({ enabled = true } = {}) {
  const queryClient = useQueryClient();
  const query = useAuthedQuery({
    enabled,
    queryFn: async (service) => {
      try {
        return await service.getInstallReadiness();
      } catch (error) {
        logger.error('Failed to load install readiness', error);
        throw error;
      }
    },
    queryKey: INSTALL_READINESS_QUERY_KEY,
    service: (token: string) => OnboardingService.getInstance(token),
  });

  const markAccessModeSaved = useCallback(
    (selectedMode: OnboardingAccessMode) => {
      queryClient.setQueriesData<InstallReadinessResponse>(
        { queryKey: INSTALL_READINESS_QUERY_KEY },
        (current) =>
          current
            ? { ...current, access: { ...current.access, selectedMode } }
            : current,
      );
      void queryClient.invalidateQueries({
        queryKey: INSTALL_READINESS_QUERY_KEY,
      });
    },
    [queryClient],
  );

  return {
    isLoading: query.isLoading,
    markAccessModeSaved,
    readiness: query.data ?? EMPTY_INSTALL_READINESS,
  };
}
