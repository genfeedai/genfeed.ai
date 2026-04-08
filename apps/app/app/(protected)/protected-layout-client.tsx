'use client';

import AppProtectedLayout from '@app-components/app-protected-layout';
import { GrowthBookClientProvider } from '@hooks/feature-flags/provider';
import type { ProtectedBootstrapProps } from '@props/layout/protected-bootstrap.props';
import { ErrorBoundary } from '@ui/error';
import { useOptionalAuth } from '@/hooks/useOptionalAuth';

export default function ProtectedLayoutClient({
  children,
  initialBootstrap,
}: ProtectedBootstrapProps) {
  const { userId } = useOptionalAuth();
  const accessState = initialBootstrap?.accessState;

  return (
    <GrowthBookClientProvider
      userId={userId ?? accessState?.userId ?? undefined}
      organizationId={accessState?.organizationId ?? undefined}
      plan={accessState?.subscriptionTier ?? undefined}
    >
      <AppProtectedLayout initialBootstrap={initialBootstrap}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppProtectedLayout>
    </GrowthBookClientProvider>
  );
}
