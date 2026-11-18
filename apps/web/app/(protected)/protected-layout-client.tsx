'use client';

import { SessionKeepAlive, SignedOutRedirect } from '@genfeedai/auth-client';
import { RoutedOrganizationProvider } from '@genfeedai/contexts/user/organization-context/organization-context';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ProtectedBootstrapProps } from '@props/layout/protected-bootstrap.props';
import { ErrorBoundary } from '@ui/display/error-boundary/ErrorBoundary';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import DesktopRuntimeKeepAlive from '@/components/desktop/DesktopRuntimeKeepAlive';
import AppProtectedLayout from '@/components/layouts/protected/app-protected-layout';
import WorkspaceFrameSkeleton from '@/components/shell/workspace-frame-skeleton/WorkspaceFrameSkeleton';
import { useAuthUser } from '@/hooks/auth/use-auth-user';
import { FeatureFlagProvider } from '@/hooks/feature-flags/provider';
import { identifyAnalyticsUser } from '@/lib/analytics';
import { notifyPlatformFlagsChanged } from '@/lib/platform-flags/platform-flags-sync';
import { usePlatformFlags } from '@/lib/platform-flags/use-platform-flags';
import { captureWorkspaceShellSession } from '@/lib/workspace-shell/workspace-shell-telemetry';
import ApiAuthBridge from './api-auth-bridge';
import PlatformModuleRouteGate from './platform-module-route-gate';
import RoutedOrganizationBoundary, {
  RoutedOrganizationPageGate,
} from './routed-organization-boundary';

export default function ProtectedLayoutClient({
  children,
  initialBootstrap,
}: ProtectedBootstrapProps) {
  const { user } = useAuthUser();
  const translate = useTranslations('pages.platformFlags.unavailable');
  const translatePending = useTranslations('pages.organizationRouting.pending');
  // Admin module and feature flags (#5468), server-rendered with the shell.
  const {
    flags: platformFlags,
    isReady,
    isUnavailable,
  } = usePlatformFlags(initialBootstrap?.platformFlags);

  // use-effect-audit: ignore reports to analytics, an external system
  useEffect(() => {
    captureWorkspaceShellSession();
  }, []);

  // use-effect-audit: ignore reports to analytics, an external system
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
  const flagGatedShell = isReady ? (
    <FeatureFlagProvider defaults={platformFlags}>
      <RoutedOrganizationBoundary>
        {/* Outside the shell's error boundaries, which would swallow notFound(). */}
        <PlatformModuleRouteGate>
          <AppProtectedLayout initialBootstrap={initialBootstrap}>
            <RoutedOrganizationPageGate>
              <ErrorBoundary presentation="inline">{children}</ErrorBoundary>
            </RoutedOrganizationPageGate>
          </AppProtectedLayout>
        </PlatformModuleRouteGate>
      </RoutedOrganizationBoundary>
    </FeatureFlagProvider>
  ) : isUnavailable ? (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10 sm:px-6">
      <ErrorFallback
        title={translate('title')}
        description={translate('description')}
        resetErrorBoundary={notifyPlatformFlagsChanged}
        data-testid="platform-flags-unavailable"
      />
    </main>
  ) : (
    // The same frame the organization check shows next, so the first paint
    // is already the app and nothing swaps while flags and session resolve.
    <WorkspaceFrameSkeleton label={translatePending('loading')} />
  );

  return (
    <>
      {/*
        Pins the Better Auth session store active for the whole protected shell.
        Mounted here — above AppProtectedLayout's internal Suspense boundaries —
        so it never unmounts while lazy children suspend, collapsing the
        cold-compile get-session request storm to a single fetch. See
        SessionKeepAlive for the nanostores STORE_UNMOUNT_DELAY details.
      */}
      <SessionKeepAlive />
      {/* A sign-out in this or any other tab sends the whole shell to sign-in. */}
      <SignedOutRedirect href={APP_ROUTES.LOGIN} />
      {/* Same contract for the desktop runtime store: read the bridge once. */}
      <DesktopRuntimeKeepAlive />
      <ApiAuthBridge />
      {/*
        Session, token and organization reconciliation do not read platform
        flags, so they start alongside the flags request instead of after it.
      */}
      <RoutedOrganizationProvider>{flagGatedShell}</RoutedOrganizationProvider>
    </>
  );
}
