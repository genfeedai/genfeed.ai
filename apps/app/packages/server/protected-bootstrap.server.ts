import 'server-only';

import { getBetterAuthServerToken } from '@genfeedai/auth-client/server';
import {
  isDesktopClient,
  isSelfHostedDeployment,
} from '@genfeedai/config/deployment';
import type { ProtectedBootstrapData } from '@props/layout/protected-bootstrap.props';
import { AuthService } from '@services/auth/auth.service';
import { logger } from '@services/core/logger.service';
import { cookies } from 'next/headers';
import { cache } from 'react';

const isServerBootstrapBypassed = cache(async (): Promise<boolean> => {
  const cookieStore = await cookies();

  return (
    process.env.PLAYWRIGHT_TEST === 'true' ||
    cookieStore.get('__playwright_test')?.value === 'true'
  );
});

export const getServerAuthToken = cache(async (): Promise<string> => {
  if (await isServerBootstrapBypassed()) {
    return '';
  }

  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    return (await getBetterAuthServerToken(cookieHeader)) ?? '';
  } catch (error) {
    logger.warn('Better Auth token unavailable during protected bootstrap', {
      error,
      reportToSentry: false,
    });
    return '';
  }
});

export function hasUsableServerAuthToken(token: string): boolean {
  return Boolean(token) || isSelfHostedDeployment();
}

export function shouldSkipCloudBootstrap(token: string): boolean {
  return isDesktopClient() && !token;
}

export const loadProtectedBootstrap = cache(
  async (): Promise<ProtectedBootstrapData | null> => {
    if (await isServerBootstrapBypassed()) {
      return null;
    }

    const token = await getServerAuthToken();

    if (shouldSkipCloudBootstrap(token)) {
      return null;
    }

    if (!hasUsableServerAuthToken(token)) {
      return null;
    }

    const authService = AuthService.getInstance(token);
    const bootstrap = await authService.getBootstrap().catch((error) => {
      logger.error('Failed to load protected bootstrap payload', error);
      return null;
    });

    if (!bootstrap) {
      return null;
    }

    return {
      accessState: bootstrap.access,
      brandId: bootstrap.access.brandId ?? '',
      brands: bootstrap.brands ?? [],
      currentUser: bootstrap.currentUser,
      darkroomCapabilities: bootstrap.darkroomCapabilities,
      organizationId: bootstrap.access.organizationId ?? '',
      settings: bootstrap.settings,
      streak: bootstrap.streak,
    };
  },
);
