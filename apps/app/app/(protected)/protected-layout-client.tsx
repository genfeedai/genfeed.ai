'use client';

import AppProtectedLayout from '@app-components/app-protected-layout';
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
      <AppProtectedLayout initialBootstrap={initialBootstrap}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppProtectedLayout>
    </FeatureFlagProvider>
  );
}
