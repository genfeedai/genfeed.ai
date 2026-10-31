import 'server-only';

import { getBetterAuthServerToken } from '@genfeedai/auth-client/server';
import { isDesktopClient } from '@genfeedai/config/deployment';
import type { ProtectedBootstrapData } from '@props/layout/protected-bootstrap.props';
import { AuthService } from '@services/auth/auth.service';
import { logger } from '@services/core/logger.service';
import { PublicService } from '@services/external/public.service';
import { cookies } from 'next/headers';
import { cache } from 'react';
import {
  resolveServerSuperAdmin,
  resolveServerSuperAdminFromToken,
} from './admin-ip-access.server';
import { isDesktopServerRequest } from './desktop-request.server';
import { getRequestDeployment } from './request-deployment.server';

export { isDesktopServerRequest } from './desktop-request.server';

/**
 * Isolated Playwright builds only. Matches `isPlaywrightBypassRequest` in
 * `proxy.ts`: trusted env signal AND `__playwright_test=true`. The cookie
 * alone is not authorization.
 */
export const isProtectedBootstrapBypassed = cache(
  async (): Promise<boolean> => {
    const isPlaywrightTestBuild =
      process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === 'true' ||
      process.env.PLAYWRIGHT_TEST === 'true';

    if (!isPlaywrightTestBuild) {
      return false;
    }

    const cookieStore = await cookies();
    const hasPlaywrightBypassCookie =
      cookieStore.get('__playwright_test')?.value === 'true';

    return hasPlaywrightBypassCookie;
  },
);

/**
 * Isolated Playwright builds only: lets a spec visit `/admin` as a signed-in
 * visitor who is not a superadmin, since the bypass above otherwise treats
 * every test session as one. Same trust rule as the bypass: test build AND cookie.
 */
export const isPlaywrightAdminDenied = cache(async (): Promise<boolean> => {
  if (!(await isProtectedBootstrapBypassed())) {
    return false;
  }

  const cookieStore = await cookies();
  return cookieStore.get('__playwright_admin_denied')?.value === 'true';
});

export const getServerAuthToken = cache(async (): Promise<string> => {
  if (await isProtectedBootstrapBypassed()) {
    return '';
  }

  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    // A missing token renders the visitor without admin or bootstrap until the
    // next load (#8556), so every failed exchange says why.
    return (
      (await getBetterAuthServerToken(cookieHeader, {
        onFailure: (failure) =>
          logger.warn('Better Auth token exchange failed', {
            ...failure,
            // A 401/403 is a signed-out visitor; anything else is a fault.
            reportToSentry:
              failure.reason !== 'http' || (failure.status ?? 0) >= 429,
          }),
      })) ?? ''
    );
  } catch (error) {
    logger.warn('Better Auth token unavailable during protected bootstrap', {
      error,
      reportToSentry: false,
    });
    return '';
  }
});

export async function hasUsableServerAuthToken(
  token: string,
): Promise<boolean> {
  return Boolean(token) || (await getRequestDeployment()) === 'self-hosted';
}

export function shouldSkipCloudBootstrap(
  token: string,
  isDesktopSurface = isDesktopClient(),
): boolean {
  return isDesktopSurface && !token;
}

export const loadProtectedBootstrap = cache(
  async (): Promise<ProtectedBootstrapData | null> => {
    if (await isProtectedBootstrapBypassed()) {
      return null;
    }

    const token = await getServerAuthToken();

    if (shouldSkipCloudBootstrap(token, await isDesktopServerRequest())) {
      return null;
    }

    if (!(await hasUsableServerAuthToken(token))) {
      return null;
    }

    const authService = AuthService.getInstance(token);
    const [bootstrap, platformFlags] = await Promise.all([
      authService.getBootstrap().catch((error) => {
        logger.error('Failed to load protected bootstrap payload', error);
        return null;
      }),
      PublicService.getInstance()
        .getPlatformFlags()
        .catch((error: unknown) => {
          logger.warn('Failed to load platform flags for the shell', {
            error,
            reportToSentry: false,
          });
          return null;
        }),
    ]);

    if (!bootstrap) {
      return null;
    }

    const isSuperAdmin = await resolveServerSuperAdmin(
      bootstrap.access,
      bootstrap.currentUser,
    );

    return {
      accessState: { ...bootstrap.access, isSuperAdmin },
      brandId: bootstrap.access.brandId ?? '',
      brands: bootstrap.brands ?? [],
      currentUser: bootstrap.currentUser,
      fleetCapabilities: bootstrap.fleetCapabilities,
      organizationId: bootstrap.access.organizationId ?? '',
      platformFlags,
      settings: bootstrap.settings,
      streak: bootstrap.streak,
    };
  },
);

/**
 * The admin-subtree gate. Reads the `isSuperAdmin` claim off the server token
 * instead of loading the whole bootstrap payload, so entering `/admin` costs
 * one token exchange rather than a token exchange, the bootstrap and the
 * platform flags in sequence.
 */
export const loadServerSuperAdmin = cache(async (): Promise<boolean> => {
  const token = await getServerAuthToken();

  if (
    shouldSkipCloudBootstrap(token, await isDesktopServerRequest()) ||
    !(await hasUsableServerAuthToken(token))
  ) {
    return false;
  }

  return resolveServerSuperAdminFromToken(token);
});
