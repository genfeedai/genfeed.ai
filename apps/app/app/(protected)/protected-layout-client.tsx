'use client';

import AppProtectedLayout from '@app-components/app-protected-layout';
import { useAuth } from '@clerk/nextjs';
import { GrowthBookClientProvider } from '@hooks/feature-flags/provider';
import type { ProtectedBootstrapProps } from '@props/layout/protected-bootstrap.props';
import { ErrorBoundary } from '@ui/error';

export default function ProtectedLayoutClient({
  children,
  initialBootstrap,
}: ProtectedBootstrapProps) {
  const { userId } = useAuth();

  return (
    <GrowthBookClientProvider userId={userId ?? undefined}>
      <AppProtectedLayout initialBootstrap={initialBootstrap}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppProtectedLayout>
    </GrowthBookClientProvider>
  );
}
