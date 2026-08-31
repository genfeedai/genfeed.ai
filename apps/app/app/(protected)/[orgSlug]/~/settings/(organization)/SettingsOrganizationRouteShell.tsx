import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { type ReactNode, Suspense } from 'react';

export function SettingsOrganizationRouteShell({
  children,
}: {
  children: ReactNode;
}) {
  return <Suspense fallback={<PageLoadingState />}>{children}</Suspense>;
}
