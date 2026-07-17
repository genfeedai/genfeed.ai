'use client';

import AppProtectedLayout from '@app-components/app-protected-layout';
import { FeatureFlagProvider } from '@hooks/feature-flags/provider';
import type { ProtectedBootstrapProps } from '@props/layout/protected-bootstrap.props';
import { ErrorBoundary } from '@ui/error';
import { useEffect } from 'react';
import { captureWorkspaceShellSession } from '@/lib/workspace-shell/workspace-shell-telemetry';

export default function ProtectedLayoutClient({
  children,
  initialBootstrap,
}: ProtectedBootstrapProps) {
  useEffect(() => {
    captureWorkspaceShellSession();
  }, []);

  return (
    <FeatureFlagProvider>
      <AppProtectedLayout initialBootstrap={initialBootstrap}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppProtectedLayout>
    </FeatureFlagProvider>
  );
}
