'use client';

import AppProtectedLayout from '@app-components/app-protected-layout';
import { SessionKeepAlive } from '@genfeedai/auth-client';
import { FeatureFlagProvider } from '@hooks/feature-flags/provider';
import type { ProtectedBootstrapProps } from '@props/layout/protected-bootstrap.props';
import { ErrorBoundary } from '@ui/error';
import { useEffect } from 'react';
import { getCoreAppFeatureFlagFallbacks } from '@/lib/core-apps';
import { captureWorkspaceShellSession } from '@/lib/workspace-shell/workspace-shell-telemetry';

const CORE_APP_FEATURE_FLAG_FALLBACKS = getCoreAppFeatureFlagFallbacks();

export default function ProtectedLayoutClient({
  children,
  initialBootstrap,
}: ProtectedBootstrapProps) {
  useEffect(() => {
    captureWorkspaceShellSession();
  }, []);

  return (
    <FeatureFlagProvider fallbacks={CORE_APP_FEATURE_FLAG_FALLBACKS}>
      {/*
        Pins the Better Auth session store active for the whole protected shell.
        Mounted here — above AppProtectedLayout's internal Suspense boundaries —
        so it never unmounts while lazy children suspend, collapsing the
        cold-compile get-session request storm to a single fetch. See
        SessionKeepAlive for the nanostores STORE_UNMOUNT_DELAY details.
      */}
      <SessionKeepAlive />
      <AppProtectedLayout initialBootstrap={initialBootstrap}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppProtectedLayout>
    </FeatureFlagProvider>
  );
}
