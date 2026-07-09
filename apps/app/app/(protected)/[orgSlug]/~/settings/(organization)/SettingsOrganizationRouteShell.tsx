import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { type ReactNode, Suspense } from 'react';

export function SettingsOrganizationRouteShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      {children}
    </Suspense>
  );
}
