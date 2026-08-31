import { type ReactNode, Suspense } from 'react';

export function SettingsOrganizationRouteShell({
  children,
}: {
  children: ReactNode;
}) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
