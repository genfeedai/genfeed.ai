import 'server-only';

import { auth } from '@clerk/nextjs/server';
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
  const isDesktopShell = process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1';
  const hasClerkKeys =
    Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    Boolean(process.env.CLERK_SECRET_KEY);

  if (await isServerBootstrapBypassed()) {
    return '';
  }

  if (isDesktopShell) {
    try {
      const { getToken, sessionId, userId } = await auth();

      if (!userId || !sessionId) {
        return '';
      }

      return (await getToken()) ?? '';
    } catch (error) {
      logger.warn('Desktop auth unavailable during protected bootstrap', {
        error,
        reportToSentry: false,
      });
      return '';
    }
  }

  if (process.env.NODE_ENV !== 'production' && !hasClerkKeys) {
    return '';
  }

  try {
    const { getToken, sessionId, userId } = await auth();

    if (!userId || !sessionId) {
      return '';
    }

    return (await getToken()) ?? '';
  } catch (error) {
    logger.warn('Server auth unavailable during protected bootstrap', {
      error,
      reportToSentry: false,
    });
    return '';
  }
});

export function hasUsableServerAuthToken(token: string): boolean {
  const hasClerkKeys =
    Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    Boolean(process.env.CLERK_SECRET_KEY);
  const isSelfHostedApp = !process.env.NEXT_PUBLIC_GENFEED_CLOUD;

  return Boolean(token) || isSelfHostedApp || !hasClerkKeys;
}

export function shouldSkipCloudBootstrap(token: string): boolean {
  return process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1' && !token;
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
