import ProtectedLayoutClient from '@app/(protected)/protected-layout-client';
import { loadProtectedBootstrap } from '@app-server/protected-bootstrap.server';
import type { LayoutProps } from '@props/layout/layout.props';

export default async function ProtectedLayout({ children }: LayoutProps) {
  const initialBootstrap = await loadProtectedBootstrap();

  return (
    <ProtectedLayoutClient initialBootstrap={initialBootstrap}>
      {children}
    </ProtectedLayoutClient>
  );
}
