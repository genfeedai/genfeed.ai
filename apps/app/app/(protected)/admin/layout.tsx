import {
  isProtectedBootstrapBypassed,
  loadProtectedBootstrap,
} from '@app-server/protected-bootstrap.server';
import type { LayoutProps } from '@props/layout/layout.props';
import { notFound } from 'next/navigation';

/**
 * Platform admin is gated on `platformRole = SUPERADMIN` only.
 *
 * A previous deployment-mode gate hid every admin page behind a 404 on
 * self-host / local Portless while the app switcher still offered Admin for
 * superadmins — shell chrome without content.
 *
 * Isolated Playwright builds (`PLAYWRIGHT_TEST` /
 * `NEXT_PUBLIC_PLAYWRIGHT_TEST` plus the `__playwright_test` cookie) skip
 * server bootstrap. Treat that as an explicit test superadmin so mocked
 * admin pages render. A client cookie alone does not bypass this gate.
 */
export default async function AdminLayout({ children }: LayoutProps) {
  if (await isProtectedBootstrapBypassed()) {
    return children;
  }

  const bootstrap = await loadProtectedBootstrap();

  if (!bootstrap?.accessState?.isSuperAdmin) {
    notFound();
  }

  return children;
}
