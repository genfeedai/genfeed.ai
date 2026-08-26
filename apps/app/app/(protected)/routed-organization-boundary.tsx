'use client';

import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import PageLoadingState from '@ui/loading/page/PageLoadingState';

export default function RoutedOrganizationBoundary({ children }: LayoutProps) {
  const { isRouteConfirmed, retry, status } = useRoutedOrganization();

  if (isRouteConfirmed) {
    return <>{children}</>;
  }

  if (status === 'unauthorized') {
    return (
      <ErrorFallback
        title="Organization unavailable"
        description="This organization does not exist or your account is not authorized to access it."
      />
    );
  }

  if (status === 'failed') {
    return (
      <ErrorFallback
        title="Organization switch failed"
        description="The requested organization could not be confirmed. No tenant data was loaded."
        resetErrorBoundary={retry}
      />
    );
  }

  if (status === 'stale') {
    return (
      <ErrorFallback
        title="Organization context changed"
        description="Another tab changed organization context. Synchronize this tab before continuing."
        resetErrorBoundary={retry}
      />
    );
  }

  return (
    <PageLoadingState
      fullScreen
      message={
        status === 'switching'
          ? 'Switching organization'
          : 'Confirming organization context'
      }
    />
  );
}
