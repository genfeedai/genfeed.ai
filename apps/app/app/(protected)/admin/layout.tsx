import { loadProtectedBootstrap } from '@app-server/protected-bootstrap.server';
import { isSaaS } from '@genfeedai/config/deployment';
import type { LayoutProps } from '@props/layout/layout.props';
import { notFound } from 'next/navigation';

export default async function AdminLayout({ children }: LayoutProps) {
  const bootstrap = await loadProtectedBootstrap();

  if (!isSaaS() || !bootstrap?.accessState?.isSuperAdmin) {
    notFound();
  }

  return children;
}
