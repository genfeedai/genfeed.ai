'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@contexts/user/brand-context/brand-context.helpers';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { logger } from '@services/core/logger.service';
import { ServicesService } from '@services/external/services.service';
import { resolveOAuthServicePath } from '@ui/constants/oauth-connect-platforms';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/** sessionStorage key read by `/oauth/[platform]` after provider redirect. */
export const OAUTH_RETURN_TO_STORAGE_KEY = 'oauth_return_to';

export interface UsePlatformOAuthConnectOptions {
  /**
   * Absolute app path to land on after OAuth verify succeeds.
   * Defaults to the current location (pathname + search).
   */
  returnTo?: string;
  /**
   * Brand id for the connect payload. Defaults to the active brand context.
   */
  brandId?: string | null;
}

/**
 * Start a platform OAuth connect without navigating to brand settings.
 * Appends `return_to` for clients that preserve it, and always mirrors the
 * path into sessionStorage so `/oauth/[platform]` can return here after the
 * fixed provider redirect URI drops query params.
 */
export function usePlatformOAuthConnect(
  options: UsePlatformOAuthConnectOptions = {},
): (platform: string) => Promise<void> {
  const { getToken } = useAuthIdentity();
  const { selectedBrand } = useBrand();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const defaultReturnTo = search ? `${pathname}?${search}` : pathname;

  return useCallback(
    async (platform: string) => {
      try {
        const token = await resolveAuthToken(getToken);
        if (!token) {
          return;
        }

        const brandId =
          options.brandId === null
            ? undefined
            : (options.brandId ??
              (selectedBrand ? getBrandEntityId(selectedBrand) : undefined));
        if (!brandId) {
          throw new Error('Select a brand before connecting an account');
        }
        const returnTo = options.returnTo ?? defaultReturnTo;

        try {
          sessionStorage.setItem(OAUTH_RETURN_TO_STORAGE_KEY, returnTo);
        } catch {
          // Private mode / blocked storage — URL param is best-effort only.
        }

        const service = new ServicesService(
          resolveOAuthServicePath(platform),
          token,
        );
        const credential = await service.postConnect({ brandId });
        const separator = credential.url.includes('?') ? '&' : '?';
        window.open(
          `${credential.url}${separator}return_to=${encodeURIComponent(returnTo)}`,
          '_self',
        );
      } catch (error) {
        logger.error('OAuth connect failed', error);
        throw error;
      }
    },
    [
      defaultReturnTo,
      getToken,
      options.brandId,
      options.returnTo,
      selectedBrand,
    ],
  );
}
