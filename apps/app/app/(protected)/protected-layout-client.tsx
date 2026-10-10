'use client';

import AppProtectedLayout from '@app-components/app-protected-layout';
import { SessionKeepAlive } from '@genfeedai/auth-client';
import { RoutedOrganizationProvider } from '@genfeedai/contexts/user/organization-context/organization-context';
import { useAuthUser } from '@hooks/auth/use-auth-user';
import { FeatureFlagProvider } from '@hooks/feature-flags/provider';
import type { ProtectedBootstrapProps } from '@props/layout/protected-bootstrap.props';
import { ErrorBoundary } from '@ui/error';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { identifyAnalyticsUser } from '@/lib/analytics';
import { notifyPlatformFlagsChanged } from '@/lib/platform-flags/platform-flags-sync';
import { usePlatformFlags } from '@/lib/platform-flags/use-platform-flags';
import { captureWorkspaceShellSession } from '@/lib/workspace-shell/workspace-shell-telemetry';
import ApiAuthBridge from './api-auth-bridge';
import PlatformModuleRouteGate from './platform-module-route-gate';
import RoutedOrganizationBoundary from './routed-organization-boundary';

export default function ProtectedLayoutClient({
  children,
  initialBootstrap,
}: ProtectedBootstrapProps) {
  const { user } = useAuthUser();
  const translate = useTranslations('pages.platformFlags.unavailable');
  // Admin module and feature flags (#5468), server-rendered with the shell.
  const {
    flags: platformFlags,
    isReady,
    isUnavailable,
  } = usePlatformFlags(initialBootstrap?.platformFlags);

  useEffect(() => {
    captureWorkspaceShellSession();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    identifyAnalyticsUser({
      id: user.id,
      isInternal:
        user.primaryEmailAddress?.emailAddress
          ?.trim()
          .toLowerCase()
          .endsWith('@genfeed.ai') === true,
    });
  }, [user?.id, user?.primaryEmailAddress?.emailAddress]);

  // An unknown flag state is recoverable; it must not become a route 404.
  if (!isReady) {
    return isUnavailable ? (
      <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10 sm:px-6">
        <ErrorFallback
          title={translate('title')}
          description={translate('description')}
          resetErrorBoundary={notifyPlatformFlagsChanged}
          data-testid="platform-flags-unavailable"
        />
      </main>
    ) : (
      <LazyLoadingFallback variant="full" />
    );
  }

  return (
    <FeatureFlagProvider defaults={platformFlags}>
      {/*
        Pins the Better Auth session store active for the whole protected shell.
        Mounted here — above AppProtectedLayout's internal Suspense boundaries —
        so it never unmounts while lazy children suspend, collapsing the
        cold-compile get-session request storm to a single fetch. See
        SessionKeepAlive for the nanostores STORE_UNMOUNT_DELAY details.
      */}
      <SessionKeepAlive />
      <ApiAuthBridge />
      <RoutedOrganizationProvider>
        <RoutedOrganizationBoundary>
          {/* Outside the shell's error boundaries, which would swallow notFound(). */}
          <PlatformModuleRouteGate>
            <AppProtectedLayout initialBootstrap={initialBootstrap}>
              <ErrorBoundary>{children}</ErrorBoundary>
            </AppProtectedLayout>
          </PlatformModuleRouteGate>
        </RoutedOrganizationBoundary>
      </RoutedOrganizationProvider>
    </FeatureFlagProvider>
  );
}
