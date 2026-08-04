import { loadProtectedBootstrap } from '@app-server/protected-bootstrap.server';
import type { LayoutProps } from '@props/layout/layout.props';
import { notFound } from 'next/navigation';

/**
 * Platform admin is gated on `platformRole = SUPERADMIN` only.
 *
 * Previously this also required `isSaaS()`, which hid every admin page behind
 * a 404 on self-host / local Portless while the app switcher still offered
 * Admin for superadmins — shell chrome without content.
 */
export default async function AdminLayout({ children }: LayoutProps) {
  const bootstrap = await loadProtectedBootstrap();

  if (!bootstrap?.accessState?.isSuperAdmin) {
    notFound();
  }

  return children;
}
