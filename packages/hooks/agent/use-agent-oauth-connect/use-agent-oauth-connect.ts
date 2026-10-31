'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationSlug } from '@contexts/user/brand-context/brand-context.helpers';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { resolveOAuthServicePath } from '@genfeedai/helpers/oauth/oauth-connect-platforms';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { OAuthBrandRequiredError } from '@hooks/auth/use-platform-oauth-connect/oauth-brand-required.error';
import { rememberOAuthConnectContext } from '@hooks/auth/use-platform-oauth-connect/oauth-connect-context';
import { OAUTH_RETURN_TO_STORAGE_KEY } from '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';
import { useOrgUrl } from '@hooks/navigation/use-org-url/use-org-url';
import { useRouteParams } from '@hooks/navigation/use-route-params';
import { logger } from '@services/core/logger.service';
import { ServicesService } from '@services/external/services.service';
import { useCallback } from 'react';

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
export function useAgentOAuthConnect(): (platform: string) => Promise<void> {
  const params = useRouteParams<{ id?: string; threadId?: string }>();
  const { brandSlug, href, orgSlug } = useOrgUrl();
  const { getToken } = useAuthIdentity();
  const { brands, selectedBrand } = useBrand();
  const connectionBrand = brandSlug
    ? brands.find(
        (brand) =>
          brand.slug === brandSlug &&
          getBrandOrganizationSlug(brand) === orgSlug,
      )
    : selectedBrand;

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

        if (!connectionBrand) {
          throw new OAuthBrandRequiredError();
        }

        const servicePath = resolveOAuthServicePath(platform);
        const service = new ServicesService(servicePath, token);
        const credential = await service.postConnect({
          brandId: connectionBrand.id,
        });
        const returnTo = threadId
          ? href(`${APP_ROUTES.AGENT.ROOT}/${threadId}`)
          : href(APP_ROUTES.AGENT.NEW);
        try {
          sessionStorage.setItem(OAUTH_RETURN_TO_STORAGE_KEY, returnTo);
        } catch {
          // Private mode — the return_to query is best-effort only.
        }
        rememberOAuthConnectContext({
          brandId: connectionBrand.id,
          credentialId: credential.id,
        });
        const separator = credential.url.includes('?') ? '&' : '?';
        window.open(
          `${credential.url}${separator}return_to=${encodeURIComponent(returnTo)}`,
          '_self',
        );
      } catch (error) {
        if (error instanceof OAuthBrandRequiredError) {
          throw error;
        }
        logger.error('OAuth connect failed', error);
        // Let the invoking surface restore an actionable error state instead
        // of leaving a connect control looking successful after a failed API
        // request. Each current consumer handles the rejection locally.
        throw error;
      }
    },
    [connectionBrand, getToken, href, threadId],
  );
}
