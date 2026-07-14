'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useOrgUrl } from '@hooks/navigation/use-org-url/use-org-url';
import { logger } from '@services/core/logger.service';
import { ServicesService } from '@services/external/services.service';
import { useParams } from 'next/navigation';
import { useCallback } from 'react';

export interface UseAgentOAuthConnectOptions {
  /**
   * Whether the caller is on the agent onboarding surface. Callers pass their
   * own route-normalized value — the raw pathname carries the `/[orgSlug]/~`
   * prefix and can't be matched against `APP_ROUTES.AGENT.ONBOARDING` here.
   * Controls whether `return_to` points back to the onboarding or standard
   * agent route. Defaults to `false`.
   */
  isOnboarding?: boolean;
}

/**
 * Shared handler for the agent `oauth_connect_card`. Kicks off a platform OAuth
 * connect via {@link ServicesService} and redirects the tab to the provider's
 * auth URL, appending a `return_to` that brings the user back to the agent
 * surface they came from.
 *
 * Backs BOTH the dedicated `/agent` workspace page and the globally-mounted
 * floating agent panel from one implementation — previously the panel received
 * no handler, so the card was a no-op everywhere except `/agent`.
 */
export function useAgentOAuthConnect(
  options: UseAgentOAuthConnectOptions = {},
): (platform: string) => Promise<void> {
  const { isOnboarding = false } = options;
  const params = useParams<{ id?: string; threadId?: string }>();
  const { orgHref } = useOrgUrl();
  const { getToken } = useAuthIdentity();
  const { selectedBrand } = useBrand();

  // Route params are prefix-independent, so the active thread id resolves the
  // same way from the workspace page and the floating panel.
  const threadId =
    typeof params.threadId === 'string' && params.threadId.length > 0
      ? params.threadId
      : typeof params.id === 'string' && params.id.length > 0
        ? params.id
        : undefined;

  return useCallback(
    async (platform: string) => {
      try {
        const token = await resolveAuthToken(getToken);
        if (!token) {
          return;
        }

        // Brand is optional for agent OAuth; uses active brand if available.
        const service = new ServicesService(platform, token);
        const credential = await service.postConnect({
          ...(selectedBrand ? { brand: selectedBrand.id } : {}),
        });
        const returnTo = isOnboarding
          ? threadId
            ? orgHref(`${APP_ROUTES.AGENT.ONBOARDING}/${threadId}`)
            : orgHref(APP_ROUTES.AGENT.ONBOARDING)
          : threadId
            ? orgHref(`${APP_ROUTES.AGENT.ROOT}/${threadId}`)
            : orgHref(APP_ROUTES.AGENT.NEW);
        const separator = credential.url.includes('?') ? '&' : '?';
        window.open(
          `${credential.url}${separator}return_to=${encodeURIComponent(returnTo)}`,
          '_self',
        );
      } catch (error) {
        logger.error('OAuth connect failed', error);
        // Let the invoking surface restore an actionable error state instead
        // of leaving a connect control looking successful after a failed API
        // request. Each current consumer handles the rejection locally.
        throw error;
      }
    },
    [getToken, isOnboarding, orgHref, selectedBrand, threadId],
  );
}
