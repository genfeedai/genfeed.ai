import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import messages from '@app-i18n/page-scopes/admin';
import {
  isPlaywrightAdminDenied,
  isProtectedBootstrapBypassed,
  loadServerSuperAdmin,
} from '@app-server/protected-bootstrap.server';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { LayoutProps } from '@props/layout/layout.props';
import { redirect } from 'next/navigation';
import AdminContextSidebar from '@/components/workspace-shell/AdminContextSidebar';

/**
 * Platform admin is gated on `platformRole = SUPERADMIN` only.
 *
 * A previous deployment-mode gate hid every admin page behind a 404 on
 * self-host / local Portless while the app switcher still offered Admin for
 * superadmins — shell chrome without content.
 *
 * The gate reads the JWT's `isSuperAdmin` claim (`loadServerSuperAdmin`), not
 * the full bootstrap: it runs on every navigation into `/admin`, and the shell
 * above this layout already loads the bootstrap client-side.
 *
 * Isolated Playwright builds (`PLAYWRIGHT_TEST` /
 * `NEXT_PUBLIC_PLAYWRIGHT_TEST` plus the `__playwright_test` cookie) skip
 * server bootstrap. Treat that as an explicit test superadmin so mocked
 * admin pages render. A client cookie alone does not bypass this gate.
 *
 * A visitor without admin access is redirected to the app root, which resolves
 * their workspace, instead of getting a 404 inside the admin chrome.
 */
export default async function AdminLayout({ children }: LayoutProps) {
  const isSuperAdmin = (await isProtectedBootstrapBypassed())
    ? !(await isPlaywrightAdminDenied())
    : await loadServerSuperAdmin();

  if (!isSuperAdmin) {
    // Send the visitor back to their workspace. Rendering a 404 here would
    // leave the admin shell's rails around it.
    redirect(APP_ROUTES.ROOT);
  }

  return (
    <AppPageIntlProvider pages={messages}>
      {children}
      <AdminContextSidebar />
    </AppPageIntlProvider>
  );
}
