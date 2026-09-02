'use client';

import AppProtectedLayout from '@app-components/app-protected-layout';
import { SessionKeepAlive } from '@genfeedai/auth-client';
import { RoutedOrganizationProvider } from '@genfeedai/contexts/user/organization-context/organization-context';
import {
  APP_SWITCHER_FEATURE_FLAG_KEYS,
  DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG,
  REPLY_BOT_FEATURE_FLAG,
} from '@genfeedai/contracts/constants';
import { useAuthUser } from '@hooks/auth/use-auth-user';
import { FeatureFlagProvider } from '@hooks/feature-flags/provider';
import type { ProtectedBootstrapProps } from '@props/layout/protected-bootstrap.props';
import { ErrorBoundary } from '@ui/error';
import { useEffect, useState } from 'react';
import {
  identifyAnalyticsUser,
  subscribeAnalyticsFeatureFlags,
} from '@/lib/analytics';
import { getCoreAppFeatureFlagFallbacks } from '@/lib/core-apps';
import { captureWorkspaceShellSession } from '@/lib/workspace-shell/workspace-shell-telemetry';
import ApiAuthBridge from './api-auth-bridge';
import RoutedOrganizationBoundary from './routed-organization-boundary';

const CORE_APP_FEATURE_FLAG_FALLBACKS = getCoreAppFeatureFlagFallbacks();
const REMOTE_FEATURE_FLAG_KEYS = [
  ...APP_SWITCHER_FEATURE_FLAG_KEYS,
  DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG,
  REPLY_BOT_FEATURE_FLAG,
] as const;

export default function ProtectedLayoutClient({
  children,
  initialBootstrap,
}: ProtectedBootstrapProps) {
  const { user } = useAuthUser();
  const [remoteFeatureFlags, setRemoteFeatureFlags] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    captureWorkspaceShellSession();
  }, []);

  useEffect(() => {
    setRemoteFeatureFlags({});

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

    return subscribeAnalyticsFeatureFlags(
      REMOTE_FEATURE_FLAG_KEYS,
      setRemoteFeatureFlags,
    );
  }, [user?.id, user?.primaryEmailAddress?.emailAddress]);

  return (
    <FeatureFlagProvider
      fallbacks={CORE_APP_FEATURE_FLAG_FALLBACKS}
      overrides={remoteFeatureFlags}
    >
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
          <AppProtectedLayout initialBootstrap={initialBootstrap}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </AppProtectedLayout>
        </RoutedOrganizationBoundary>
      </RoutedOrganizationProvider>
    </FeatureFlagProvider>
  );
}
